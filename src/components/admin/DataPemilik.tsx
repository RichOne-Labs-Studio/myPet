import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Phone,
  MapPin,
  Calendar,
  PawPrint,
  FileText,
  Clock,
  Sparkles,
  X,
  Trash2,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { Owner, Pet, PetType } from '../../types';
import { formatDateTimeDisplay } from '../../utils/dateUtils';
import { getPetEmoji, getPetTypeIndonesian, getPetTypeLabelWithEmoji } from '../../utils/petUtils';

interface Props {
  navigate: (to: AppRoute) => void;
  onSelectPetForSoap?: (pet: Pet) => void;
}

export const DataPemilik: React.FC<Props> = ({ navigate, onSelectPetForSoap }) => {
  const {
    owners,
    pets,
    getPetsByOwnerPhone,
    registerPatient,
    deleteOwner,
    deletePet,
    updateOwner,
    syncStatus,
    syncFromSpreadsheet,
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(null);
  const [ownerToDelete, setOwnerToDelete] = useState<Owner | null>(null);
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);

  // Modal to edit owner
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerWhatsapp, setEditOwnerWhatsapp] = useState('');
  const [editOwnerAddress, setEditOwnerAddress] = useState('');

  useEffect(() => {
    if (editingOwner) {
      setEditOwnerName(editingOwner.name || '');
      setEditOwnerWhatsapp(editingOwner.whatsapp || '');
      setEditOwnerAddress(editingOwner.address || '');
    }
  }, [editingOwner]);

  const handleSaveEditOwner = () => {
    if (!editingOwner) return;
    updateOwner(editingOwner.id, {
      name: editOwnerName.trim(),
      whatsapp: editOwnerWhatsapp.trim(),
      address: editOwnerAddress.trim(),
    });
    setEditingOwner(null);
  };

  // Modal to add new pet to an owner
  const [modalOwner, setModalOwner] = useState<Owner | null>(null);
  const [newPetName, setNewPetName] = useState('');
  const [newPetType, setNewPetType] = useState<PetType>('Cat');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetAge, setNewPetAge] = useState('');
  const [newPetSex, setNewPetSex] = useState<'Jantan' | 'Betina'>('Jantan');
  const [newPetComplaint, setNewPetComplaint] = useState('');

  const filteredOwners = useMemo(() => {
    const q = debouncedSearch.toLowerCase().trim();
    if (!q) return owners;
    return owners.filter((o) => {
      const nameMatch = String(o.name || '').toLowerCase().includes(q);
      const waMatch = String(o.whatsapp || '').includes(q);
      const addrMatch = String(o.address || '').toLowerCase().includes(q);
      const idMatch = String(o.id || '').toLowerCase().includes(q);
      if (nameMatch || waMatch || addrMatch || idMatch) return true;

      // Juga cocok jika pemilik ini memiliki hewan dengan nama/ID yang dicari
      const ownerPets = getPetsByOwnerPhone(o.whatsapp, o.id);
      return ownerPets.some((p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.id || '').toLowerCase().includes(q) ||
        String(p.breed || '').toLowerCase().includes(q)
      );
    });
  }, [owners, debouncedSearch, pets, getPetsByOwnerPhone]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.ceil(filteredOwners.length / pageSize) || 1;
  const paginatedOwners = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOwners.slice(start, start + pageSize);
  }, [filteredOwners, currentPage]);

  const toggleExpand = (id: string) => {
    setExpandedOwnerId((prev) => (prev === id ? null : id));
  };

  const handleCreatePetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalOwner || !newPetName.trim()) return;

    registerPatient({
      owner: {
        name: modalOwner.name,
        whatsapp: modalOwner.whatsapp,
        address: modalOwner.address,
      },
      pet: {
        name: newPetName.trim(),
        type: newPetType,
        breed: newPetBreed.trim() || 'Domestik',
        ageOrDob: newPetAge.trim() || '1 Tahun',
        sex: newPetSex,
      },
      visit: {
        chiefComplaint: newPetComplaint.trim() || 'Pemeriksaan rutin & pendaftaran hewan baru',
        serviceType: 'Consultation',
      },
    });

    setModalOwner(null);
    setNewPetName('');
    setNewPetBreed('');
    setNewPetAge('');
    setNewPetComplaint('');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-fuchsia-700" />
            <span>Basis Data Klien Pemilik Hewan</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Relasi 1 Pemilik terhubung ke beberapa hewan (1-to-many) berdasarkan nomor WhatsApp. Klik baris untuk melihat semua hewan.
          </p>
        </div>

        {/* Controls: Search & Sync */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau WhatsApp..."
              className="w-full px-3.5 py-2 pl-9 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 font-mono"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          </div>
        </div>
      </div>

      {/* Owners Table */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-neutral-50 text-neutral-500 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-200">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">Nama Pemilik</th>
                <th className="px-4 py-3">WhatsApp / Telepon</th>
                <th className="px-4 py-3">Alamat Domisili</th>
                <th className="px-4 py-3 text-center">Jumlah Hewan</th>
                <th className="px-4 py-3">Terdaftar Sejak</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {paginatedOwners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                    Tidak ditemukan data pemilik dengan kriteria pencarian tersebut.
                  </td>
                </tr>
              ) : (
                paginatedOwners.map((owner) => {
                  const ownerPhoneStr = String(owner.whatsapp ?? '');
                  const ownerPets = getPetsByOwnerPhone(ownerPhoneStr, owner.id);
                  const isExpanded = expandedOwnerId === owner.id;

                  return (
                    <React.Fragment key={owner.id}>
                      {/* Main Owner Row */}
                      <tr
                        onClick={() => toggleExpand(owner.id)}
                        className={`cursor-pointer transition hover:bg-neutral-50/80 ${
                          isExpanded ? 'bg-neutral-50/60 border-l-2 border-l-fuchsia-600' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-center text-neutral-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-fuchsia-700" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-bold text-neutral-900 text-sm block">{owner.name}</span>
                          <span className="text-[10px] font-mono text-neutral-400">{owner.id}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-fuchsia-800 flex items-center gap-1.5 font-bold">
                            <Phone className="w-3.5 h-3.5 text-fuchsia-600" />
                            <span>{ownerPhoneStr}</span>
                          </span>
                        </td>

                        <td className="px-4 py-3 max-w-xs truncate text-neutral-600" title={owner.address}>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            <span>{owner.address}</span>
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-fuchsia-50 text-fuchsia-800 px-2.5 py-1 rounded-full border border-fuchsia-200">
                            <PawPrint className="w-3 h-3" />
                            <span>{ownerPets.length} Ekor</span>
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-neutral-600 text-[11px] whitespace-nowrap">
                          {formatDateTimeDisplay(owner.registeredAt)}
                        </td>

                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => setModalOwner(owner)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-800 text-xs font-semibold border border-fuchsia-200 transition"
                              title="Tambahkan hewan baru ke pemilik ini"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah Pet</span>
                            </button>

                            <button
                              onClick={() => setEditingOwner(owner)}
                              className="p-1.5 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition"
                              title="Edit data pemilik"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setOwnerToDelete(owner)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition"
                              title="Hapus data pemilik"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDED ACCORDION: PETS ASSOCIATED WITH THIS OWNER */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/80 border-b border-neutral-200">
                          <td colSpan={7} className="p-4 sm:p-5">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                                <div className="flex items-center gap-2">
                                  <PawPrint className="w-4 h-4 text-fuchsia-700" />
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                                    Daftar Hewan Peliharaan ({owner.name} - {ownerPhoneStr})
                                  </h4>
                                </div>
                                <span className="text-[11px] text-neutral-400 font-mono">
                                  Relational Key: WhatsApp Phone Link
                                </span>
                              </div>

                              {ownerPets.length === 0 ? (
                                <p className="text-xs text-neutral-500 py-3">
                                  Belum ada hewan yang terhubung ke kontak ini.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {ownerPets.map((p) => (
                                    <div
                                      key={p.id}
                                      className="p-3.5 rounded-xl bg-white border border-neutral-200/80 shadow-2xs flex flex-col justify-between hover:border-neutral-300 transition"
                                    >
                                      <div>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-2xl">
                                              {getPetEmoji(p.type)}
                                            </span>
                                            <div>
                                              <p className="font-bold text-neutral-900 text-sm">{p.name}</p>
                                              <p className="text-[11px] text-neutral-500">
                                                {getPetTypeIndonesian(p.type)} • {p.breed || 'Mix'}
                                              </p>
                                            </div>
                                          </div>
                                          <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                              p.status === 'Sehat'
                                                ? 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                                                : p.status === 'Rawat Inap'
                                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                                            }`}
                                          >
                                            {p.status}
                                          </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-600 bg-neutral-50 p-2 rounded-lg my-2 font-mono border border-neutral-100">
                                          <div>
                                            <span className="text-neutral-400 block text-[10px]">Umur:</span>
                                            <span className="text-neutral-800 font-semibold">{p.ageOrDob}</span>
                                          </div>
                                          <div>
                                            <span className="text-neutral-400 block text-[10px]">Kelamin:</span>
                                            <span className="text-neutral-800 font-semibold">{p.sex}</span>
                                          </div>
                                        </div>

                                        {p.notes && (
                                          <p className="text-[11px] text-neutral-500 italic mb-2">
                                            Catatan: {p.notes}
                                          </p>
                                        )}
                                      </div>

                                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
                                        <button
                                          onClick={() => setPetToDelete(p)}
                                          className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                                          title="Hapus hewan"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                          onClick={() => {
                                            if (onSelectPetForSoap) onSelectPetForSoap(p);
                                            navigate('/admin/rekam-medis');
                                          }}
                                          className="inline-flex items-center gap-1 text-[11px] font-bold text-fuchsia-800 hover:text-fuchsia-900 bg-fuchsia-50 hover:bg-fuchsia-100 border border-fuchsia-200 px-2.5 py-1 rounded-md transition"
                                        >
                                          <FileText className="w-3 h-3" />
                                          <span>Buat SOAP</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-neutral-200/80 text-xs">
          <span className="text-neutral-500 font-medium">
            Menampilkan halaman <strong className="text-neutral-900">{currentPage}</strong> dari <strong className="text-neutral-900">{totalPages}</strong> ({filteredOwners.length} total pemilik)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* MODAL: DELETE OWNER CONFIRMATION */}
      {ownerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-sm w-full p-5 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-900">Hapus Data Pemilik?</h3>
                <p className="text-[11px] text-neutral-500">Tindakan ini akan menghapus pemilik dari sistem.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-xl border border-neutral-200 mb-4">
              Anda yakin ingin menghapus data pemilik <strong>{ownerToDelete.name}</strong> ({ownerToDelete.whatsapp})?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOwnerToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteOwner(ownerToDelete.id);
                  setOwnerToDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE PET CONFIRMATION */}
      {petToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-sm w-full p-5 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-900">Hapus Pasien / Hewan?</h3>
                <p className="text-[11px] text-neutral-500">Pasien akan dihapus dari data klinik.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-xl border border-neutral-200 mb-4">
              Anda yakin ingin menghapus pasien <strong>{petToDelete.name}</strong> ({petToDelete.type} - {petToDelete.breed})?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPetToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deletePet(petToDelete.id);
                  setPetToDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD PET TO OWNER */}
      {modalOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-6 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 mb-4">
              <div className="flex items-center gap-2">
                <PawPrint className="w-5 h-5 text-fuchsia-700" />
                <h3 className="font-bold text-base text-neutral-900">Tambah Hewan untuk {modalOwner.name}</h3>
              </div>
              <button
                onClick={() => setModalOwner(null)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePetSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Nama Hewan</label>
                <input
                  type="text"
                  required
                  value={newPetName}
                  onChange={(e) => setNewPetName(e.target.value)}
                  placeholder="Contoh: Bella, Kitty, Kuro"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 text-xs focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Jenis Hewan</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(['Cat', 'Dog', 'Rabbit', 'Exotic', 'Farm Animal'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewPetType(t)}
                      className={`p-2 rounded-lg border text-center text-[11px] font-bold transition ${
                        newPetType === t ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {getPetTypeLabelWithEmoji(t)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Ras / Trah</label>
                  <input
                    type="text"
                    value={newPetBreed}
                    onChange={(e) => setNewPetBreed(e.target.value)}
                    placeholder="Contoh: Persian, Beagle"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 text-xs focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-semibold mb-1">Umur / DOB</label>
                  <input
                    type="text"
                    value={newPetAge}
                    onChange={(e) => setNewPetAge(e.target.value)}
                    placeholder="Contoh: 1.5 Tahun"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 text-xs focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Jenis Kelamin</label>
                <div className="flex gap-3">
                  <label className={`flex-1 p-2 rounded-lg border text-center cursor-pointer transition ${newPetSex === 'Jantan' ? 'border-sky-500 bg-sky-50 text-sky-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                    <input type="radio" name="modalSex" checked={newPetSex === 'Jantan'} onChange={() => setNewPetSex('Jantan')} className="hidden" />
                    <span>♂ Jantan</span>
                  </label>
                  <label className={`flex-1 p-2 rounded-lg border text-center cursor-pointer transition ${newPetSex === 'Betina' ? 'border-pink-500 bg-pink-50 text-pink-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                    <input type="radio" name="modalSex" checked={newPetSex === 'Betina'} onChange={() => setNewPetSex('Betina')} className="hidden" />
                    <span>♀ Betina</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setModalOwner(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold shadow-xs"
                >
                  Simpan Hewan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT OWNER */}
      {editingOwner && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setEditingOwner(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition animate-pulse"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base text-neutral-900 mb-1">Edit Data Pemilik</h3>
            <p className="text-xs text-neutral-500 mb-4">
              Perbarui rincian kontak pemilik hewan di bawah ini.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditOwner();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Nama Pemilik</label>
                <input
                  type="text"
                  required
                  value={editOwnerName}
                  onChange={(e) => setEditOwnerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">WhatsApp / Telepon</label>
                <input
                  type="text"
                  required
                  value={editOwnerWhatsapp}
                  onChange={(e) => setEditOwnerWhatsapp(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm font-mono focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold text-fuchsia-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Alamat Domisili</label>
                <textarea
                  required
                  rows={3}
                  value={editOwnerAddress}
                  onChange={(e) => setEditOwnerAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingOwner(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 font-semibold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

