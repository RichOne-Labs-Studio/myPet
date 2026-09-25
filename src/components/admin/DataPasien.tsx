import React, { useState, useMemo, useEffect } from 'react';
import {
  PawPrint,
  Search,
  Filter,
  FileText,
  Heart,
  Scale,
  Calendar,
  Phone,
  User,
  Activity,
  MapPin,
  CheckCircle2,
  X,
  Plus,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Clock,
  Stethoscope,
  Hotel,
  ShieldCheck,
  MessageCircle,
  Trash2,
  RefreshCw,
  Edit,
} from 'lucide-react';
import { useClinic } from '../../context/ClinicContext';
import { AppRoute } from '../../navigation';
import { Pet, PetType } from '../../types';
import { formatDateTimeDisplay } from '../../utils/dateUtils';
import { normalizePhoneWithZero, toWhatsappNumber } from '../../utils/phoneUtils';
import { getPetEmoji, getPetTypeIndonesian, normalizePetType } from '../../utils/petUtils';

interface Props {
  navigate: (to: AppRoute) => void;
  onSelectPetForSoap?: (pet: Pet) => void;
}

export const DataPasien: React.FC<Props> = ({ navigate, onSelectPetForSoap }) => {
  const {
    pets,
    owners,
    queues,
    soapRecords,
    cages,
    inpatientHistory,
    deletePet,
    updatePet,
    syncStatus,
    syncFromSpreadsheet,
  } = useClinic();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecies, setSelectedSpecies] = useState<'all' | PetType>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | Pet['status']>('all');
  const [expandedPetId, setExpandedPetId] = useState<string | null>(null);
  const [petToDelete, setPetToDelete] = useState<Pet | null>(null);

  // States for editing patient (Pet)
  const [editingPet, setEditingPet] = useState<Pet | null>(null);
  const [editPetName, setEditPetName] = useState('');
  const [editPetType, setEditPetType] = useState<PetType>('Cat');
  const [editPetBreed, setEditPetBreed] = useState('');
  const [editPetAge, setEditPetAge] = useState('');
  const [editPetSex, setEditPetSex] = useState<'Jantan' | 'Betina'>('Jantan');
  const [editPetWeight, setEditPetWeight] = useState(0);
  const [editPetStatus, setEditPetStatus] = useState<Pet['status']>('Sehat');

  useEffect(() => {
    if (editingPet) {
      setEditPetName(editingPet.name || '');
      setEditPetType(editingPet.type || 'Cat');
      setEditPetBreed(editingPet.breed || '');
      setEditPetAge(editingPet.ageOrDob || '');
      setEditPetSex(editingPet.sex === 'Betina' ? 'Betina' : 'Jantan');
      setEditPetWeight(editingPet.weight || 0);
      setEditPetStatus(editingPet.status || 'Sehat');
    }
  }, [editingPet]);

  const handleSaveEditPet = () => {
    if (!editingPet) return;
    updatePet(editingPet.id, {
      name: editPetName.trim(),
      type: editPetType,
      breed: editPetBreed.trim(),
      ageOrDob: editPetAge.trim(),
      sex: editPetSex,
      weight: Number(editPetWeight) || 0,
      status: editPetStatus,
    });
    setEditingPet(null);
  };

  // Fast O(1) Lookup Maps to eliminate delay/lag
  const ownerMap = useMemo(() => {
    const map = new Map<string, any>();
    owners.forEach((o) => {
      if (o.id) map.set(o.id, o);
      if (o.whatsapp) {
        const cleanPhone = String(o.whatsapp ?? '').replace(/\D/g, '');
        if (cleanPhone) map.set(cleanPhone, o);
        const normPhone = normalizePhoneWithZero(o.whatsapp);
        if (normPhone) map.set(normPhone, o);
      }
      if (o.name) {
        map.set(o.name.toLowerCase().trim(), o);
      }
    });
    return map;
  }, [owners]);

  const petSoapRecordsMap = useMemo(() => {
    const map = new Map<string, typeof soapRecords>();
    soapRecords.forEach((s) => {
      if (s.petId) {
        const list = map.get(s.petId) || [];
        list.push(s);
        map.set(s.petId, list);
      }
      if (s.petName) {
        const key = String(s.petName || '').toLowerCase().trim();
        const list = map.get(key) || [];
        list.push(s);
        map.set(key, list);
      }
    });
    return map;
  }, [soapRecords]);

  const cageMap = useMemo(() => {
    const map = new Map<string, any>();
    cages.forEach((c) => {
      if (c.petId) map.set(c.petId, c);
    });
    return map;
  }, [cages]);

  // Resolves full owner data for a pet across owners list, pet.ownerName, queues, or past soap records
  const getOwnerForPet = (pet: Pet) => {
    if (pet.ownerId && ownerMap.has(pet.ownerId)) {
      return ownerMap.get(pet.ownerId);
    }
    const cleanWp = String(pet.ownerWhatsapp || '').replace(/\D/g, '');
    if (cleanWp && ownerMap.has(cleanWp)) {
      return ownerMap.get(cleanWp);
    }
    const normWp = normalizePhoneWithZero(pet.ownerWhatsapp);
    if (normWp && ownerMap.has(normWp)) {
      return ownerMap.get(normWp);
    }
    if (pet.ownerName && ownerMap.has(pet.ownerName.toLowerCase().trim())) {
      return ownerMap.get(pet.ownerName.toLowerCase().trim());
    }
    if (pet.ownerName) {
      return {
        id: pet.ownerId || '',
        name: pet.ownerName,
        whatsapp: pet.ownerWhatsapp,
        address: '',
        informedConsent: pet.informedConsent,
      };
    }
    // Search queue records for owner name
    const qMatch = queues.find(
      (q) => q.petId === pet.id || (cleanWp && String(q.ownerWhatsapp ?? '').replace(/\D/g, '') === cleanWp)
    );
    if (qMatch?.ownerName) {
      return {
        id: '',
        name: qMatch.ownerName,
        whatsapp: pet.ownerWhatsapp || qMatch.ownerWhatsapp,
        address: '',
        informedConsent: qMatch.informedConsent || pet.informedConsent,
      };
    }
    // Search SOAP records
    const sMatch = soapRecords.find((s) => s.petId === pet.id || (pet.name && s.petName?.toLowerCase() === pet.name.toLowerCase()));
    if (sMatch?.ownerName) {
      return {
        id: '',
        name: sMatch.ownerName,
        whatsapp: pet.ownerWhatsapp || sMatch.ownerWhatsapp,
        address: '',
      };
    }
    return null;
  };

  const filteredPets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const cleanDigits = searchQuery.replace(/\D/g, '');

    return pets.filter((pet) => {
      const owner = getOwnerForPet(pet);
      const ownerName = String(owner?.name || pet.ownerName || '').toLowerCase();
      const ownerAddress = String(owner?.address || '').toLowerCase();
      const petName = String(pet.name || '').toLowerCase();
      const petId = String(pet.id || '').toLowerCase();
      const petBreed = String(pet.breed || '').toLowerCase();
      const petWhatsapp = String(pet.ownerWhatsapp || '');
      const cleanWp = petWhatsapp.replace(/\D/g, '');

      // Search matches pet name, pet ID, pet breed, owner name, owner address, or whatsapp number
      const matchesSearch =
        !q ||
        petName.includes(q) ||
        petId.includes(q) ||
        petBreed.includes(q) ||
        ownerName.includes(q) ||
        ownerAddress.includes(q) ||
        petWhatsapp.toLowerCase().includes(q) ||
        (cleanDigits.length >= 3 && cleanWp.includes(cleanDigits));

      const matchesSpecies = selectedSpecies === 'all' || normalizePetType(pet.type) === selectedSpecies;
      const matchesStatus = selectedStatus === 'all' || pet.status === selectedStatus;

      return matchesSearch && matchesSpecies && matchesStatus;
    });
  }, [pets, searchQuery, selectedSpecies, selectedStatus, ownerMap, queues, soapRecords]);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSpecies, selectedStatus]);

  const totalPages = Math.ceil(filteredPets.length / pageSize) || 1;
  const paginatedPets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPets.slice(start, start + pageSize);
  }, [filteredPets, currentPage]);

  const toggleExpand = (id: string) => {
    setExpandedPetId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-neutral-200/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-neutral-900 tracking-tight flex items-center gap-2">
            <PawPrint className="w-6 h-6 text-fuchsia-700" />
            <span>Basis Data Pasien Hewan Terdaftar</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Daftar lengkap seluruh hewan peliharaan teregistrasi. Klik baris pasien untuk melihat data profil lengkap, pemilik, dan riwayat rekam medis.
          </p>
        </div>

        {/* Controls: Search & Sync */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama hewan, ID, ras, pemilik, atau WhatsApp..."
              className="w-full px-3.5 py-2 pl-9 pr-8 rounded-xl bg-neutral-50 border border-neutral-200 text-neutral-900 placeholder-neutral-400 text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-fuchsia-500 font-medium"
            />
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-neutral-600 p-0.5 rounded cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
        {/* Species Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-neutral-500 font-semibold px-2">Spesies:</span>
          {(
            [
              { id: 'all', label: 'Semua Spesies' },
              { id: 'Cat', label: '🐱 Kucing' },
              { id: 'Dog', label: '🐶 Anjing' },
              { id: 'Rabbit', label: '🐰 Kelinci' },
              { id: 'Exotic', label: '🦜 Eksotik' },
              { id: 'Farm Animal', label: '🐄 Hewan Ternak' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSpecies(s.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                selectedSpecies === s.id
                  ? 'bg-fuchsia-700 text-white shadow-2xs'
                  : 'bg-neutral-50 text-neutral-600 hover:text-neutral-900 border border-neutral-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-500 font-semibold px-2">Status:</span>
          {(
            [
              { id: 'all', label: 'Semua Status' },
              { id: 'Sehat', label: 'Sehat' },
              { id: 'Perawatan', label: 'Perawatan' },
              { id: 'Rawat Inap', label: 'Rawat Inap' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStatus(st.id)}
              className={`px-2.5 py-1.5 rounded-xl font-semibold transition cursor-pointer ${
                selectedStatus === st.id
                  ? 'bg-neutral-100 text-neutral-900 border border-neutral-300 font-bold'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Search Active Notice */}
      {searchQuery && (
        <div className="flex items-center justify-between px-4 py-2 rounded-xl bg-fuchsia-50 border border-fuchsia-200 text-xs text-fuchsia-900">
          <span>
            Hasil pencarian untuk <strong>"{searchQuery}"</strong> (Ditemukan {filteredPets.length} pasien)
          </span>
          <button
            onClick={() => setSearchQuery('')}
            className="text-fuchsia-700 hover:text-fuchsia-900 font-bold underline cursor-pointer"
          >
            Reset Pencarian
          </button>
        </div>
      )}

      {/* Patients Table with Expandable Rows (Identical UX to Data Pemilik) */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-700">
            <thead className="bg-neutral-50 text-neutral-500 font-mono text-[11px] uppercase tracking-wider border-b border-neutral-200">
              <tr>
                <th className="w-10 px-3 py-3"></th>
                <th className="px-4 py-3">Nama Pasien & ID</th>
                <th className="px-4 py-3">Spesies & Ras</th>
                <th className="px-4 py-3">Kelamin / Umur / BB</th>
                <th className="px-4 py-3">Pemilik & Kontak</th>
                <th className="px-4 py-3 text-center">Status Pasien</th>
                <th className="px-4 py-3 text-center">Rekam Medis</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {paginatedPets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-neutral-500 space-y-1">
                    <p className="font-bold text-neutral-700 text-sm">Tidak ditemukan data pasien dengan kriteria pencarian tersebut.</p>
                    <p className="text-neutral-400 text-xs">Coba ubah kata kunci pencarian atau reset filter spesies dan status.</p>
                  </td>
                </tr>
              ) : (
                paginatedPets.map((pet) => {
                  const isExpanded = expandedPetId === pet.id;
                  const owner = getOwnerForPet(pet);
                  const ownerDisplayName = owner?.name || pet.ownerName || 'Klien Terdaftar';
                  const ownerPhone = String(pet.ownerWhatsapp || owner?.whatsapp || '-');
                  const cleanPhone = ownerPhone.replace(/\D/g, '');
                  
                  const petHistory =
                    (pet.id ? petSoapRecordsMap.get(pet.id) : null) ||
                    (pet.name ? petSoapRecordsMap.get(String(pet.name || '').toLowerCase().trim()) : null) ||
                    [];
                  const petInpatientHistory = (inpatientHistory || []).filter(
                    (h) =>
                      (pet.id && h.petId === pet.id) ||
                      (pet.name && h.petName && h.petName.toLowerCase().trim() === pet.name.toLowerCase().trim())
                  );
                  const soapCount = petHistory.length;
                  const currentCage = cageMap.get(pet.id);

                  return (
                    <React.Fragment key={pet.id}>
                      {/* Main Patient Row */}
                      <tr
                        onClick={() => toggleExpand(pet.id)}
                        className={`cursor-pointer transition hover:bg-neutral-50/80 ${
                          isExpanded ? 'bg-neutral-50/60 border-l-2 border-l-fuchsia-600' : ''
                        }`}
                      >
                        {/* Expand/Collapse Chevron Indicator */}
                        <td className="px-3 py-3 text-center text-neutral-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-fuchsia-700" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        {/* Pet Name & ID */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-neutral-100 border border-neutral-200/80 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                              {pet.photoUrl ? (
                                <img
                                  src={pet.photoUrl}
                                  alt={pet.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-xl">{getPetEmoji(pet.type)}</span>
                              )}
                            </div>
                            <div>
                              <span className="font-bold text-neutral-900 text-sm block tracking-tight">
                                {pet.name}
                              </span>
                              <span className="text-[10px] font-mono text-neutral-400">{pet.id}</span>
                            </div>
                          </div>
                        </td>

                        {/* Species & Breed */}
                        <td className="px-4 py-3">
                          <span className="font-semibold text-neutral-900 block">{getPetTypeIndonesian(pet.type)}</span>
                          <span className="text-[11px] text-neutral-500 truncate block max-w-[140px]">
                            {pet.breed || 'Mix'}
                          </span>
                        </td>

                        {/* Sex, Age, Weight */}
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <span className="text-neutral-800 font-semibold block">
                            {pet.sex} • {pet.ageOrDob || '-'}
                          </span>
                          <span className="text-fuchsia-800 font-bold">
                            {pet.weight ? `${pet.weight} kg` : '-'}
                          </span>
                        </td>

                        {/* Owner & WhatsApp */}
                        <td className="px-4 py-3">
                          <span className="font-bold text-neutral-900 block truncate max-w-[160px]">
                            {ownerDisplayName}
                          </span>
                          {cleanPhone ? (
                            <span className="font-mono text-fuchsia-800 flex items-center gap-1 text-[11px] font-semibold">
                              <Phone className="w-3 h-3 text-fuchsia-600 shrink-0" />
                              <span>{ownerPhone}</span>
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Status Klinis Badge */}
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                              pet.status === 'Sehat'
                                ? 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200'
                                : pet.status === 'Rawat Inap'
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            <span>{pet.status}</span>
                          </span>
                        </td>

                        {/* SOAP Count Badge */}
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-fuchsia-50 text-fuchsia-800 px-2.5 py-1 rounded-full border border-fuchsia-200">
                            <FileText className="w-3 h-3 text-fuchsia-600" />
                            <span>{soapCount} SOAP</span>
                          </span>
                        </td>

                        {/* Action Buttons */}
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => {
                                if (onSelectPetForSoap) onSelectPetForSoap(pet);
                                navigate('/admin/rekam-medis');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                              title="Buka form SOAP untuk pasien ini"
                            >
                              <Stethoscope className="w-3.5 h-3.5" />
                              <span>SOAP</span>
                            </button>

                            <button
                              onClick={() => setEditingPet(pet)}
                              className="p-1.5 rounded-lg text-amber-600 hover:text-amber-800 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition cursor-pointer"
                              title="Edit data pasien"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => setPetToDelete(pet)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer"
                              title="Hapus data pasien"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDED ACCORDION: COMPLETE PATIENT & OWNER & MEDICAL DETAILS */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/80 border-b border-neutral-200">
                          <td colSpan={8} className="p-4 sm:p-6">
                            <div className="space-y-4">
                              {/* Top Banner Inside Expanded */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                                <div className="flex items-center gap-3">
                                  <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative">
                                    {pet.photoUrl ? (
                                      <img
                                        src={pet.photoUrl}
                                        alt={pet.name}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <span className="text-3xl">{getPetEmoji(pet.type)}</span>
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-base font-extrabold text-neutral-900">
                                        {pet.name}
                                      </h4>
                                      <span className="font-mono text-xs text-neutral-500 bg-white px-2 py-0.5 rounded border border-neutral-200">
                                        ID: {pet.id}
                                      </span>
                                      {pet.informedConsent || owner?.informedConsent ? (
                                        <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                          <span>Consent Disetujui</span>
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-0.5">
                                      Terdaftar sejak:{' '}
                                      <span className="font-mono text-neutral-700 font-medium">
                                        {formatDateTimeDisplay(pet.registeredAt)}
                                      </span>
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setPetToDelete(pet)}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold transition cursor-pointer"
                                    title="Hapus data pasien"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Hapus Pasien</span>
                                  </button>

                                  <button
                                    onClick={() => {
                                      if (onSelectPetForSoap) onSelectPetForSoap(pet);
                                      navigate('/admin/rekam-medis');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Buat Rekam Medis (SOAP) Baru</span>
                                  </button>
                                </div>
                              </div>

                              {/* Bento Grid: 3 Clean Detail Cards */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Card 1: Profil Fisik Pasien */}
                                <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-2.5">
                                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900 border-b border-neutral-100 pb-2">
                                    <PawPrint className="w-3.5 h-3.5 text-fuchsia-700" />
                                    <span>Profil Fisik Pasien</span>
                                  </div>

                                  <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-neutral-500">Spesies / Ras:</span>
                                      <span className="font-bold text-neutral-900">
                                        {pet.type} • {pet.breed || 'Mix'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-neutral-500">Jenis Kelamin:</span>
                                      <span className="font-bold text-neutral-900">{pet.sex}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-neutral-500">Umur / Tgl Lahir:</span>
                                      <span className="font-bold text-neutral-900 font-mono">{pet.ageOrDob || '-'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-neutral-500">Berat Badan:</span>
                                      <span className="font-bold text-fuchsia-800 font-mono">
                                        {pet.weight ? `${pet.weight} kg` : 'Belum ditimbang'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                                      <span className="text-neutral-500">Status Terkini:</span>
                                      <span className="font-bold text-neutral-900">{pet.status}</span>
                                    </div>
                                    {currentCage && (
                                      <div className="p-2 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-semibold flex items-center gap-1.5 mt-2">
                                        <Hotel className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                        <span>Rawat Inap di Kandang {currentCage.label} ({currentCage.size})</span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Card 2: Kontak & Domisili Pemilik */}
                                <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-2.5">
                                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900">
                                      <User className="w-3.5 h-3.5 text-fuchsia-700" />
                                      <span>Kontak Pemilik</span>
                                    </div>
                                    {owner?.id && (
                                      <span className="font-mono text-[10px] text-neutral-400">{owner.id}</span>
                                    )}
                                  </div>

                                  <div className="space-y-2 text-xs">
                                    <div>
                                      <span className="text-[10px] text-neutral-500 block">Nama Pemilik:</span>
                                      <button
                                        type="button"
                                        onClick={() => setSearchQuery(ownerDisplayName)}
                                        className="font-bold text-neutral-900 hover:text-fuchsia-700 text-left cursor-pointer"
                                        title={`Filter hewan milik ${ownerDisplayName}`}
                                      >
                                        {ownerDisplayName}
                                      </button>
                                    </div>

                                    <div>
                                      <span className="text-[10px] text-neutral-500 block">Nomor WhatsApp:</span>
                                      {cleanPhone ? (
                                        <a
                                          href={`https://wa.me/${toWhatsappNumber(cleanPhone)}?text=Halo%20Kak%20${encodeURIComponent(
                                            ownerDisplayName
                                          )},%20kami%20dari%20Vier%20Pet%20Care%20mengenai%20pasien%20${encodeURIComponent(
                                            pet.name
                                          )}.`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-mono text-fuchsia-800 hover:text-fuchsia-900 font-bold flex items-center gap-1.5 hover:underline"
                                        >
                                          <Phone className="w-3.5 h-3.5 text-fuchsia-600" />
                                          <span>{ownerPhone}</span>
                                          <ExternalLink className="w-3 h-3 text-neutral-400 ml-1" />
                                        </a>
                                      ) : (
                                        <span className="text-neutral-400 font-mono">-</span>
                                      )}
                                    </div>

                                    <div>
                                      <span className="text-[10px] text-neutral-500 block">Alamat Domisili:</span>
                                      <p className="text-neutral-700 flex items-start gap-1 leading-relaxed">
                                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0 mt-0.5" />
                                        <span>{owner?.address || 'Alamat belum diinput'}</span>
                                      </p>
                                    </div>

                                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigate('/admin/pemilik');
                                        }}
                                        className="text-[11px] text-fuchsia-700 hover:text-fuchsia-900 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        <span>Lihat di Data Pemilik →</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Card 3: Riwayat SOAP & Rekam Medis Pasien */}
                                <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-2.5">
                                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900">
                                      <FileText className="w-3.5 h-3.5 text-fuchsia-700" />
                                      <span>Riwayat Rekam Medis ({petHistory.length})</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (onSelectPetForSoap) onSelectPetForSoap(pet);
                                        navigate('/admin/rekam-medis');
                                      }}
                                      className="text-[11px] text-fuchsia-700 hover:text-fuchsia-900 font-bold hover:underline cursor-pointer"
                                    >
                                      Buka Semua →
                                    </button>
                                  </div>

                                  {petHistory.length === 0 ? (
                                    <div className="py-5 text-center text-neutral-400 space-y-1">
                                      <FileText className="w-7 h-7 mx-auto text-neutral-300 mb-1" />
                                      <p className="text-xs font-medium text-neutral-600">Belum ada catatan SOAP</p>
                                      <p className="text-[11px] text-neutral-400">
                                        Klik tombol "Buat SOAP Baru" untuk memulai pemeriksaan medis pertama.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                      {petHistory.slice(0, 3).map((rec) => (
                                        <div
                                          key={rec.id}
                                          className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1 hover:border-fuchsia-300 transition"
                                        >
                                          <div className="flex items-center justify-between font-mono text-[11px]">
                                            <span className="font-bold text-fuchsia-800">{rec.date}</span>
                                            <span className="text-neutral-500 truncate max-w-[120px]">
                                              {rec.veterinarian}
                                            </span>
                                          </div>
                                          <p className="text-neutral-800 font-semibold line-clamp-1">
                                            <strong>Diagnosa:</strong> {rec.soap.assessment || '-'}
                                          </p>
                                          <p className="text-neutral-500 text-[11px] line-clamp-1">
                                            <strong>Terapi:</strong> {rec.soap.plan || '-'}
                                          </p>
                                          {rec.prescriptions && rec.prescriptions.length > 0 && (
                                            <p className="text-[10px] text-neutral-400 truncate">
                                              💊 {rec.prescriptions.map((p) => p.itemName).join(', ')}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                      {petHistory.length > 3 && (
                                        <p className="text-[11px] text-center text-neutral-400 pt-1">
                                          +{petHistory.length - 3} riwayat kunjungan lainnya
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Card 4: Full-width Inpatient History for this Pet */}
                              {petInpatientHistory.length > 0 && (
                                <div className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-2.5 mt-4">
                                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-900 border-b border-neutral-100 pb-2">
                                    <Hotel className="w-3.5 h-3.5 text-fuchsia-700" />
                                    <span>Riwayat Rawat Inap Sebelumnya ({petInpatientHistory.length})</span>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-80 overflow-y-auto pr-1">
                                    {petInpatientHistory.map((hist) => (
                                      <div
                                        key={hist.id}
                                        className="p-3 bg-fuchsia-50/20 border border-fuchsia-100 rounded-xl space-y-2 text-xs"
                                      >
                                        <div className="flex items-center justify-between pb-1.5 border-b border-fuchsia-100/50">
                                          <span className="font-mono text-fuchsia-800 font-bold bg-fuchsia-100/60 px-2 py-0.5 rounded-md">
                                            {hist.cageLabel ? `Kandang ${hist.cageLabel}` : 'Perawatan Rawat Inap'}
                                          </span>
                                          <span className="text-neutral-500 text-[10px] font-mono">
                                            Masuk: {hist.admittedAt} | Keluar: {hist.dischargedAt}
                                          </span>
                                        </div>

                                        <div className="text-neutral-700 space-y-1">
                                          <p>
                                            <strong className="text-neutral-900 block font-bold text-[11px]">Diagnosa:</strong>
                                            <span className="italic">"{hist.diagnosis}"</span>
                                          </p>
                                          <p className="text-[11px] text-neutral-500">
                                            Dokter Penanggungjawab: <strong className="text-neutral-700">{hist.veterinarian}</strong>
                                          </p>
                                        </div>

                                        {hist.observations && hist.observations.length > 0 && (
                                          <div className="pt-2 border-t border-fuchsia-100/50">
                                            <span className="font-semibold text-neutral-700 block mb-1 text-[10px]">Catatan Observasi Harian:</span>
                                            <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-sans">
                                              {hist.observations.map((obs, oIdx) => (
                                                <div key={obs.id || oIdx} className="bg-white/80 p-1.5 rounded border border-neutral-100 text-[10px] flex justify-between gap-1">
                                                  <div>
                                                    <span className="font-bold text-neutral-800">{obs.date} {obs.time}</span> - <span className="text-neutral-600">{obs.notes}</span>
                                                  </div>
                                                  <div className="shrink-0 text-right font-mono text-neutral-500">
                                                    {obs.temp}°C | Nafsu: {obs.appetite}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Expanded Row Quick Actions Footer */}
                              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2">
                                  {cleanPhone && (
                                    <a
                                      href={`https://wa.me/${toWhatsappNumber(cleanPhone)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 transition"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Hubungi via WhatsApp</span>
                                    </a>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  {pet.status === 'Rawat Inap' && (
                                    <button
                                      onClick={() => navigate('/admin/rawat-inap')}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold border border-neutral-300 transition cursor-pointer"
                                    >
                                      <Hotel className="w-3.5 h-3.5 text-neutral-600" />
                                      <span>Lihat di Rawat Inap</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (onSelectPetForSoap) onSelectPetForSoap(pet);
                                      navigate('/admin/rekam-medis');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 text-white font-bold transition shadow-2xs cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Buka Rekam Medis (SOAP) Pasien Ini</span>
                                  </button>
                                </div>
                              </div>
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
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-neutral-200/80 text-xs shadow-2xs">
          <span className="text-neutral-500 font-medium">
            Menampilkan halaman <strong className="text-neutral-900">{currentPage}</strong> dari{' '}
            <strong className="text-neutral-900">{totalPages}</strong> ({filteredPets.length} total pasien)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-100 transition cursor-pointer"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PATIENT */}
      {editingPet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 text-neutral-900 animate-in zoom-in-95 relative duration-150">
            <button
              onClick={() => setEditingPet(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50 transition animate-pulse"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base text-neutral-900 mb-1">Edit Data Pasien</h3>
            <p className="text-xs text-neutral-500 mb-4">
              Perbarui karakteristik klinis dan identitas hewan peliharaan.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditPet();
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Nama Hewan</label>
                  <input
                    type="text"
                    required
                    value={editPetName}
                    onChange={(e) => setEditPetName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm font-bold focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Spesies</label>
                  <select
                    value={editPetType}
                    onChange={(e) => setEditPetType(e.target.value as PetType)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold"
                  >
                    <option value="Cat">🐱 Kucing (Cat)</option>
                    <option value="Dog">🐶 Anjing (Dog)</option>
                    <option value="Rabbit">🐰 Kelinci (Rabbit)</option>
                    <option value="Bird">🦜 Burung (Bird)</option>
                    <option value="Reptile">🦎 Reptil (Reptile)</option>
                    <option value="Other">🐾 Lainnya (Other)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Ras / Breed</label>
                  <input
                    type="text"
                    value={editPetBreed}
                    onChange={(e) => setEditPetBreed(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: Anggora, Mix"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Umur / Tgl Lahir</label>
                  <input
                    type="text"
                    value={editPetAge}
                    onChange={(e) => setEditPetAge(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: 1 Tahun 3 Bulan"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Jenis Kelamin</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 p-2 rounded-xl border text-center cursor-pointer text-xs transition ${editPetSex === 'Jantan' ? 'border-sky-500 bg-sky-50 text-sky-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                      <input type="radio" name="editPetSex" checked={editPetSex === 'Jantan'} onChange={() => setEditPetSex('Jantan')} className="hidden" />
                      <span>♂ Jantan</span>
                    </label>
                    <label className={`flex-1 p-2 rounded-xl border text-center cursor-pointer text-xs transition ${editPetSex === 'Betina' ? 'border-pink-500 bg-pink-50 text-pink-800 font-bold' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                      <input type="radio" name="editPetSex" checked={editPetSex === 'Betina'} onChange={() => setEditPetSex('Betina')} className="hidden" />
                      <span>♀ Betina</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Berat Badan (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editPetWeight || ''}
                    onChange={(e) => setEditPetWeight(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm font-mono focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                    placeholder="Contoh: 3.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1">Status Kesehatan / Klinis</label>
                <select
                  value={editPetStatus}
                  onChange={(e) => setEditPetStatus(e.target.value as Pet['status'])}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-sm focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 font-bold text-neutral-800 bg-white"
                >
                  <option value="Sehat">🟢 Sehat</option>
                  <option value="Sakit">🟡 Sakit (Berobat Jalan)</option>
                  <option value="Rawat Inap">🔴 Rawat Inap</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditingPet(null)}
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

      {/* MODAL: DELETE PET CONFIRMATION */}
      {petToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-sm w-full p-5 text-neutral-900 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-neutral-900">Hapus Data Pasien?</h3>
                <p className="text-[11px] text-neutral-500">Pasien akan dihapus dari data klinik.</p>
              </div>
            </div>

            <p className="text-xs text-neutral-700 bg-neutral-50 p-3 rounded-xl border border-neutral-200 mb-4">
              Anda yakin ingin menghapus data pasien <strong>{petToDelete.name}</strong> ({petToDelete.type} - {petToDelete.breed || 'Campuran'})?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPetToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-200 text-neutral-700 hover:bg-neutral-50 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  deletePet(petToDelete.id);
                  setPetToDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
