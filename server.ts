import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { syncManager } from './src/server/syncService.ts';
import { analyzeVeterinarySoap } from './src/server/veterinaryAiService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser dengan limit besar untuk menangani volume data masif
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// ==========================================
// VETERINARY AI CDSS / CO-PILOT API ROUTE
// ==========================================
app.post('/api/ai/veterinary-cdss', async (req, res) => {
  try {
    const { subjective = '', objective = '', patientInfo = {} } = req.body;
    const analysis = await analyzeVeterinarySoap({ subjective, objective, patientInfo });
    res.json({
      success: true,
      data: analysis,
    });
  } catch (err: any) {
    console.error('[API /api/ai/veterinary-cdss] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Gagal memproses analisis klinis AI.',
    });
  }
});

// ==========================================
// BACKEND SYNC API ROUTES
// ==========================================

// 1. Ambil data lengkap klinik dari memori/disk backend (Seketika ~5-10ms)
app.get('/api/sync/data', (req, res) => {
  try {
    const data = syncManager.getDatabase();
    const status = syncManager.getStatus();
    res.json({
      success: true,
      data,
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1b. Query tabel dengan server-side pagination/filtering.
// Browser menerima hanya halaman yang diminta, bukan seluruh tabel.
app.get('/api/sync/query', (req, res) => {
  try {
    const table = String(req.query.table || '') as any;
    const allowed = ['owners','pets','queues','soapRecords','cages','inventory','bookings','staff','feedbacks'];
    if (!allowed.includes(table)) {
      return res.status(400).json({ success: false, message: 'Tabel tidak valid.' });
    }

    const result = syncManager.queryTable(table, {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
      search: String(req.query.search || ''),
      species: String(req.query.species || ''),
      status: String(req.query.status || ''),
    });

    res.json({ success: true, ...result, status: syncManager.getStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1c. Bootstrap ringan untuk browser pada dataset besar.
// Server tetap memegang database penuh; browser hanya menerima working set kecil.
app.get('/api/sync/bootstrap', (req, res) => {
  try {
    const limit = Math.min(200, Math.max(25, Number(req.query.limit) || 100));
    const tables = ['owners','pets','queues','soapRecords','cages','inventory','bookings','staff','feedbacks'] as const;
    const data: Record<string, any[]> = {};
    for (const table of tables) {
      data[table] = syncManager.queryTable(table, { page: 1, limit }).data;
    }
    res.json({
      success: true,
      data,
      status: syncManager.getStatus(),
      bootstrap: true,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Status sinkronisasi & versi database saat ini (Ringan ~100 bytes untuk polling)
app.get('/api/sync/status', (req, res) => {
  try {
    const status = syncManager.getStatus();
    res.json({
      success: true,
      ...status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Picu sinkronisasi latar belakang dari Google Sheets tanpa memblokir browser
app.post('/api/sync/trigger', (req, res) => {
  try {
    // Jalankan di background
    syncManager.syncFromGoogleSheets().catch((e) => {
      console.error('[API] Trigger error:', e);
    });
    res.json({
      success: true,
      message: 'Sinkronisasi otomatis backend dimulai di latar belakang.',
      status: syncManager.getStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Upsert satu record (O(1) langsung update server dan push ke Google Sheets di background)
app.post('/api/sync/record', async (req, res) => {
  try {
    const { table, record } = req.body;
    if (!table || !record) {
      return res.status(400).json({ success: false, message: 'Parameter table dan record wajib diisi.' });
    }

    const version = await syncManager.upsertRecord(table, record);
    res.json({
      success: true,
      version,
      message: `Record ${table} berhasil disimpan di backend.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Hapus satu record
app.post('/api/sync/delete', async (req, res) => {
  try {
    const { table, id } = req.body;
    if (!table || !id) {
      return res.status(400).json({ success: false, message: 'Parameter table dan id wajib diisi.' });
    }

    const version = await syncManager.deleteRecord(table, String(id));
    res.json({
      success: true,
      version,
      message: `Record ${table} (${id}) berhasil dihapus.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Update satu tabel penuh
app.post('/api/sync/table', async (req, res) => {
  try {
    const { table, records } = req.body;
    if (!table || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'Parameter table dan records array wajib diisi.' });
    }

    const version = await syncManager.updateTable(table, records);
    res.json({
      success: true,
      version,
      message: `Tabel ${table} berhasil diperbarui.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Update konfigurasi sinkronisasi
app.post('/api/sync/config', (req, res) => {
  try {
    const { webAppUrl, autoSync } = req.body;
    syncManager.setConfig(webAppUrl, autoSync);
    res.json({
      success: true,
      status: syncManager.getStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Mulai worker sinkronisasi Google Sheets otomatis di backend
  syncManager.startBackgroundWorker();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Vier Pet Care berjalan di http://0.0.0.0:${PORT}`);
    console.log(`[Server] Sinkronisasi Google Sheets otomatis aktif di backend`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal error saat menjalankan server:', err);
  process.exit(1);
});
