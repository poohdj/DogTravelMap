'use client';

import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth, googleProvider } from '@/lib/firebase';
import { MapPin, Plus, CheckCircle, Loader, LogOut, LogIn, Clock, Check, X, Pencil, Trash2, List, AlertCircle, Search, Navigation, MousePointer2 } from 'lucide-react';
import LocationSelector from '@/components/LocationSelector';

declare global {
  interface Window { kakao: any; daum: any; }
}

const ADMIN_EMAILS = [
  'mungspot.com@gmail.com',
  'poohdj@gmail.com',
];

const CATEGORIES: Record<string, string[]> = {
  '카페': ['애견 동반 카페', '애견 전용 카페(운동장/놀이터)'],
  '식당': ['한식', '중식', '일식', '양식', '분식', '고기/구이류', '기타'],
  '명소': ['공원·산책로', '해변·강변', '계곡·산', '관광지', '쇼핑몰', '기타'],
  '숙소': ['펜션', '호텔/리조트', '캠핑장', '글램핑', '기타'],
  '기타': ['동물병원', '약국', '애견미용실', '반려용품점', '기타'],
};

// 그룹 1: 우리 아이 조건 (기존의 FACILITIES 일부 + 새로운 분류)
const DOG_CONDITIONS = [
  '오프리쉬(목줄해제) 가능',
  '대형견 입장 가능'
];

// 그룹 2: 보호자 준비물 (기존의 REQUIREMENTS 개편)
const GEAR_REQUIREMENTS = [
  '리드줄만 있으면 OK',
  '슬링백/가방 허용',
  '캐리어(뚜껑 닫힘) 필수',
  '개모차 필수',
  '실내 바닥 보행 금지(안고 있어야 함)'
];

// 그룹 3: 장소 및 편의 시설 (기존의 FACILITIES 일부)
const PLACE_FACILITIES = [
  '야외/테라스',
  '단독룸/프라이빗',
  '베이커리/간단한 식사',
  '전용 주차장'
];

// 기타/주의사항 (필터에서는 제외되나 데이터로는 유지)
const ATTENTION_ITEMS = [
  '입마개 필수(맹견/예민견)'
];

const defaultForm = {
  name: '', category: '카페', subCategory: '애견 동반 카페',
  address: '', addressDetail: '', lat: '', lng: '',
  isDogFriendly: true, requirements: [] as string[], facilities: [] as string[], notes: '',
};

type Place = {
  id: string; name: string; category: string; subCategory: string;
  address: string; addressDetail?: string; lat: number; lng: number;
  isDogFriendly: boolean; requirements: string[]; facilities: string[]; notes: string;
  createdAt?: string;
};

type Suggestion = {
  id: string; name: string; category: string; subCategory: string;
  address: string; addressDetail?: string; lat: number; lng: number;
  isDogFriendly: boolean; requirements: string[]; facilities: string[]; notes: string;
  submittedBy?: string; status: string; createdAt: string;
};

type Feedback = {
  id: string; placeId: string; placeName: string; type: string;
  message: string; createdAt: string;
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'add' | 'suggestions' | 'manage' | 'feedbacks'>('add');

  // 폼 상태
  const [form, setForm] = useState(defaultForm);
  const [editId, setEditId] = useState<string | null>(null); // 수정 중인 장소 ID
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // 제안 목록
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  // 장소 관리 목록
  const [managePlaces, setManagePlaces] = useState<Place[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Place | null>(null); // 삭제 확인 모달용

  // 장소 관리 검색/필터 상태
  const [manageSearch, setManageSearch] = useState('');
  const [manageCategory, setManageCategory] = useState('전체');

  // 피드백 목록
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [feedbacksLoading, setFeedbacksLoading] = useState(false);

  // 전역 상태 알림
  const [status, setStatus] = useState<{type: 'error' | 'success' | 'info', msg: string} | null>(null);
  const [feedbackTarget, setFeedbackTarget] = useState<Feedback | null>(null); // 피드백 삭제 확인용

  const showStatus = (msg: string, type: 'error' | 'success' | 'info' = 'error') => {
    setStatus({ type, msg });
    if (type === 'success' || type === 'info') {
      setTimeout(() => setStatus(null), 4000);
    }
  };


  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(user?.email ?? '')) return;
    if (tab === 'suggestions') loadSuggestions();
    if (tab === 'manage') loadManagePlaces();
    if (tab === 'feedbacks') loadFeedbacks();
  }, [tab, user]);

  const loadSuggestions = async () => {
    setSuggestionLoading(true);
    try {
      const snap = await getDocs(collection(db, 'suggestions'));
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Suggestion))
        .filter(s => {
          const status = (s.status || '').toLowerCase().trim();
          return status === 'pending' || !s.status;
        })
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      setSuggestions(data);
    } catch (err) {
      console.error('Error loading suggestions:', err);
    } finally { setSuggestionLoading(false); }
  };

  const loadManagePlaces = async () => {
    setManageLoading(true);
    try {
      const snap = await getDocs(collection(db, 'places'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Place))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setManagePlaces(data);
    } finally { setManageLoading(false); }
  };

  // 장소 관리 탭 필터링 로직
  const filteredManagePlaces = managePlaces.filter(place => {
    const matchesSearch = !manageSearch ||
      place.name.toLowerCase().includes(manageSearch.toLowerCase()) ||
      place.address.toLowerCase().includes(manageSearch.toLowerCase());

    const matchesCategory = manageCategory === '전체' || place.category === manageCategory;

    return matchesSearch && matchesCategory;
  });

  const loadFeedbacks = async () => {
    setFeedbacksLoading(true);
    try {
      const snap = await getDocs(collection(db, 'feedbacks'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Feedback))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setFeedbacks(data);
    } catch (err) {
      console.error('Error loading feedbacks:', err);
    } finally { setFeedbacksLoading(false); }
  };

  // 수정 버튼 클릭 → 폼에 데이터 채우고 add 탭으로 이동
  const handleEdit = (place: Place) => {
    setForm({
      name: place.name,
      category: place.category,
      subCategory: place.subCategory,
      address: place.address,
      addressDetail: place.addressDetail ?? '',
      lat: String(place.lat),
      lng: String(place.lng),
      isDogFriendly: place.isDogFriendly,
      requirements: place.requirements ?? [],
      facilities: place.facilities ?? [],
      notes: place.notes ?? '',
    });
    setEditId(place.id);
    setTab('add');
    setSuccess(false);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 피드백에서 관련 장소 수정으로 이동
  const handleEditFromFeedback = async (placeId: string) => {
    const p = managePlaces.find(x => x.id === placeId);
    if (p) {
      handleEdit(p);
    } else {
      // 리스트에 없으면 (아직 로드 전이면) 직접 로드 시도
      showStatus('장소 데이터를 찾는 중입니다...', 'info');
      loadManagePlaces().then(() => {
        const p2 = managePlaces.find(x => x.id === placeId);
        if (p2) handleEdit(p2);
        else showStatus('해당 장소를 찾을 수 없거나 이미 삭제되었습니다.');
      });
    }
  };

  const handleDeleteFeedback = (f: Feedback) => {
    setFeedbackTarget(f);
  };

  const confirmDeleteFeedback = async () => {
    if (!feedbackTarget) return;
    try {
      await deleteDoc(doc(db, 'feedbacks', feedbackTarget.id));
      setFeedbacks(prev => prev.filter(f => f.id !== feedbackTarget.id));
      setFeedbackTarget(null);
      showStatus('피드백이 삭제되었습니다.', 'success');
    } catch { showStatus('피드백 삭제 중 오류가 발생했습니다.'); }
  };

  // 삭제 확인
  const handleDelete = async (place: Place) => {
    setDeleteTarget(place);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'places', deleteTarget.id));
      setManagePlaces(prev => prev.filter(p => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      showStatus('장소가 삭제되었습니다.', 'success');
    } catch {
      showStatus('장소 삭제 중 오류가 발생했습니다.');
    }
  };

  // 제안 승인
  const handleApprove = async (s: Suggestion) => {
    try {
      await addDoc(collection(db, 'places'), {
        name: s.name, category: s.category, subCategory: s.subCategory,
        address: s.address, addressDetail: s.addressDetail ?? '',
        lat: s.lat, lng: s.lng,
        isDogFriendly: s.isDogFriendly, requirements: s.requirements,
        facilities: s.facilities ?? [], notes: s.notes,
        createdAt: new Date().toISOString(),
      });
      await deleteDoc(doc(db, 'suggestions', s.id));
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
      showStatus('제안이 승인되어 장소로 등록되었습니다.', 'success');
    } catch { showStatus('승인 중 오류가 발생했습니다.'); }
  };

  const handleReject = async (id: string) => {
    try {
      await updateDoc(doc(db, 'suggestions', id), { status: 'rejected' });
      setSuggestions(prev => prev.filter(x => x.id !== id));
      showStatus('제안이 거절 처리되었습니다.', 'info');
    } catch { showStatus('거절 처리 중 오류가 발생했습니다.'); }
  };



  const toggleRequirement = (req: string) =>
    setForm(prev => ({
      ...prev,
      requirements: prev.requirements.includes(req)
        ? prev.requirements.filter(r => r !== req)
        : [...prev.requirements, req],
    }));

  const handleCategoryChange = (cat: string) =>
    setForm(prev => ({ ...prev, category: cat, subCategory: CATEGORIES[cat][0] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.lat || !form.lng) { setError('주소 검색을 통해 위치를 먼저 지정해 주세요.'); return; }
    setLoading(true);
    try {
      const data = {
        name: form.name, category: form.category, subCategory: form.subCategory,
        address: form.address, addressDetail: form.addressDetail,
        lat: parseFloat(form.lat), lng: parseFloat(form.lng),
        isDogFriendly: form.isDogFriendly, requirements: form.requirements,
        facilities: form.facilities, notes: form.notes,
      };
      if (editId) {
        // 수정 모드
        await updateDoc(doc(db, 'places', editId), data);
        setEditId(null);
      } else {
        // 신규 추가
        await addDoc(collection(db, 'places'), { ...data, createdAt: new Date().toISOString() });
      }
      setSuccess(true);
      setForm(defaultForm);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('저장 중 오류가 발생했습니다.');
    } finally { setLoading(false); }
  };

  // --- 로그인 화면 ---
  if (authLoading) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: '#FF9F1C' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ ...styles.card, maxWidth: '360px', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
          <div style={{ fontSize: '3rem' }}>🐾</div>
          <h1 style={styles.title}>멍스팟 관리자</h1>
          <p style={{ fontSize: '0.9rem', color: '#9094A6', lineHeight: 1.6 }}>
            관리자 구글 계정으로 로그인해야<br />이 페이지에 접근할 수 있습니다.
          </p>
          <button onClick={() => signInWithPopup(auth, googleProvider)} style={{ ...styles.submitBtn, gap: '10px', width: '100%' }}>
            <LogIn size={20} /> Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  if (!ADMIN_EMAILS.includes(user.email ?? '')) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ ...styles.card, maxWidth: '360px', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          <div style={{ fontSize: '2.5rem' }}>🚫</div>
          <h2 style={{ ...styles.title, fontSize: '1.2rem' }}>접근 권한 없음</h2>
          <p style={{ fontSize: '0.88rem', color: '#9094A6' }}>{user.email} 계정은 관리자가 아닙니다.</p>
          <button onClick={() => signOut(auth)} style={{ ...styles.submitBtn, background: '#6B7280', width: '100%' }}>
            <LogOut size={18} /> 로그아웃
          </button>
        </div>
      </div>
    );
  }

  return (<>
    {/* Status Message Banner */}
    {status && (
      <div style={{
        position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 2000, padding: '16px 24px', borderRadius: '16px',
        background: status.type === 'error' ? '#FEF2F2' : status.type === 'success' ? '#F0FDF4' : '#EFF6FF',
        color: status.type === 'error' ? '#DC2626' : status.type === 'success' ? '#16A34A' : '#2563EB',
        border: `1.5px solid ${status.type === 'error' ? '#FECACA' : status.type === 'success' ? '#BBF7D0' : '#BFDBFE'}`,
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 600,
        animation: 'slideDown 0.3s ease-out'
      }} onClick={() => setStatus(null)}>
        <AlertCircle size={20} />
        {status.msg}
        <X size={16} style={{ marginLeft: '8px', opacity: 0.6, cursor: 'pointer' }} />
      </div>
    )}

    <div style={styles.page} className="admin-page-body">
      <div style={styles.card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={styles.header}>
            <MapPin size={28} color="#FF9F1C" />
            <div>
              <h1 style={styles.title}>멍스팟 관리자</h1>
              <p style={styles.subtitle}>{user.email}</p>
            </div>
          </div>
          <button onClick={() => signOut(auth)} style={{ background: '#F4F5F7', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontFamily: 'inherit', color: '#6B7280' }}>
            <LogOut size={16} /> 로그아웃
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px', flexWrap: 'wrap' }}>
          <button onClick={() => { setTab('add'); setEditId(null); setForm(defaultForm); }}
            style={{ ...styles.tabBtn, ...(tab === 'add' ? styles.tabActive : {}) }}>
            <Plus size={14} /> {editId ? '수정 중' : '장소 추가'}
          </button>
          <button onClick={() => setTab('manage')}
            style={{ ...styles.tabBtn, ...(tab === 'manage' ? styles.tabActive : {}) }}>
            <List size={14} /> 장소 관리 {managePlaces.length > 0 && `(${managePlaces.length})`}
          </button>
          <button onClick={() => setTab('suggestions')}
            style={{ ...styles.tabBtn, ...(tab === 'suggestions' ? styles.tabActive : {}) }}>
            <Clock size={14} /> 제안 검토 {suggestions.length > 0 && `(${suggestions.length})`}
          </button>
          <button onClick={() => setTab('feedbacks')}
            style={{ ...styles.tabBtn, ...(tab === 'feedbacks' ? styles.tabActive : {}) }}>
            <AlertCircle size={14} /> 유저 피드백 {feedbacks.length > 0 && `(${feedbacks.length})`}
          </button>
        </div>

        {/* Tab: 장소 추가/수정 */}
        {tab === 'add' && (
          <form onSubmit={handleSubmit} style={styles.form}>
            {editId && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#FFF8EE', borderRadius: '10px', border: '1.5px solid #FF9F1C' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#FF9F1C' }}>✏️ 수정 모드</span>
                <button type="button" onClick={() => { setEditId(null); setForm(defaultForm); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9094A6', fontFamily: 'inherit', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <X size={14} /> 취소
                </button>
              </div>
            )}

            <Field label="장소명 *">
              <input style={styles.input} type="text" required placeholder="예: 멍멍 카페 성수점"
                value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="대분류 *">
              <div style={styles.pillGroup}>
                {Object.keys(CATEGORIES).map(cat => (
                  <button key={cat} type="button" onClick={() => handleCategoryChange(cat)}
                    style={form.category === cat ? styles.pillActive : styles.pill}>{cat}</button>
                ))}
              </div>
            </Field>
            <Field label="소분류 *">
              <div style={styles.pillGroup}>
                {CATEGORIES[form.category].map(sub => (
                  <button key={sub} type="button" onClick={() => setForm(p => ({ ...p, subCategory: sub }))}
                    style={form.subCategory === sub ? { ...styles.pillActive, background: '#6D28D9', border: '1.5px solid #6D28D9' } : styles.pill}>{sub}</button>
                ))}
              </div>
            </Field>
            <Field label="주소 *">
              <div style={{ marginBottom: '16px', fontSize: '0.8rem', color: '#9094A6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={14} /> 상호명으로 검색하거나 지도 링크를 붙여넣어 위치를 지정해 주세요.
              </div>
              
              <LocationSelector 
                initialValue={{ 
                  address: form.address, 
                  lat: form.lat, 
                  lng: form.lng,
                  name: form.name 
                }}
                onSelect={({ address, lat, lng, name }) => {
                  setForm(prev => ({ 
                    ...prev, 
                    address, 
                    lat: String(lat), 
                    lng: String(lng),
                    name: name || prev.name
                  }));
                }}
              />

              <input style={{ ...styles.input, marginTop: '16px' }} type="text" placeholder="상세 주소 입력 (예: 102호, 2층)"
                value={form.addressDetail} onChange={e => setForm(p => ({ ...p, addressDetail: e.target.value }))} />
            </Field>
            <Field label="정보 검증 상태 *">
              <div style={styles.pillGroup}>
                <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: true }))}
                  style={form.isDogFriendly ? { ...styles.pillActive, background: '#16A34A', border: '1.5px solid #16A34A' } : styles.pill}>✅ 멍스팟 확인 완료</button>
                <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: false }))}
                  style={!form.isDogFriendly ? { ...styles.pillActive, background: '#6B7280', border: '1.5px solid #6B7280' } : styles.pill}>❓ 미검증 / 유저제안</button>
              </div>
            </Field>
            <Field label="우리 아이 조건 (복수 선택)">
              <div style={styles.pillGroup}>
                {DOG_CONDITIONS.map(item => (
                  <button key={item} type="button" onClick={() => toggleRequirement(item)}
                    style={form.requirements.includes(item) ? { ...styles.pillActive, background: '#7C3AED', border: '1.5px solid #7C3AED' } : styles.pill}>🐾 {item}</button>
                ))}
              </div>
            </Field>
            <Field label="보호자 준비물 (복수 선택)">
              <div style={styles.pillGroup}>
                {GEAR_REQUIREMENTS.map(item => (
                  <button key={item} type="button" onClick={() => toggleRequirement(item)}
                    style={form.requirements.includes(item) ? { ...styles.pillActive, background: '#4F46E5', border: '1.5px solid #4F46E5' } : styles.pill}>🔖 {item}</button>
                ))}
              </div>
            </Field>
            <Field label="장소 특징 및 편의 시설 (복수 선택)">
              <div style={styles.pillGroup}>
                {PLACE_FACILITIES.map(fac => (
                  <button key={fac} type="button"
                    onClick={() => setForm(p => ({
                      ...p,
                      facilities: p.facilities.includes(fac) ? p.facilities.filter(f => f !== fac) : [...p.facilities, fac]
                    }))}
                    style={form.facilities.includes(fac) ? { ...styles.pillActive, background: '#059669', border: '1.5px solid #059669' } : styles.pill}>✨ {fac}</button>
                ))}
              </div>
            </Field>
            <Field label="기타 주의사항 (복수 선택)">
              <div style={styles.pillGroup}>
                {ATTENTION_ITEMS.map(item => (
                  <button key={item} type="button" onClick={() => toggleRequirement(item)}
                    style={form.requirements.includes(item) ? { ...styles.pillActive, background: '#DC2626', border: '1.5px solid #DC2626' } : styles.pill}>⚠️ {item}</button>
                ))}
              </div>
            </Field>
            <Field label="메모 (선택)">
              <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }}
                placeholder="예: 야외 테라스만 입장 가능" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </Field>
            {error && <p style={{ color: '#DC2626', fontSize: '0.9rem', padding: '12px', background: '#FFF5F5', borderRadius: '8px' }}>⚠️ {error}</p>}
            {success && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A', padding: '12px', background: '#F0FDF4', borderRadius: '8px' }}>
              <CheckCircle size={20} /><span style={{ fontWeight: 600 }}>{editId ? '수정' : '저장'} 완료!</span></div>}
            <button type="submit" style={styles.submitBtn} disabled={loading}>
              {loading
                ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> 저장 중...</>
                : editId
                  ? <><Pencil size={20} /> 수정 저장하기</>
                  : <><Plus size={20} /> 장소 저장하기</>}
            </button>
          </form>
        )}

        {/* Tab: 장소 관리 */}
        {tab === 'manage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Search & Filter Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', color: '#94A3B8' }} />
                <input
                  style={{ ...styles.input, paddingLeft: '40px', background: '#fff' }}
                  placeholder="장소명 또는 주소 검색..."
                  value={manageSearch}
                  onChange={e => setManageSearch(e.target.value)}
                />
                {manageSearch && (
                  <button
                    onClick={() => setManageSearch('')}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {['전체', ...Object.keys(CATEGORIES)].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setManageCategory(cat)}
                    style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      background: manageCategory === cat ? '#2D3142' : '#fff',
                      color: manageCategory === cat ? '#fff' : '#64748B',
                      border: '1px solid',
                      borderColor: manageCategory === cat ? '#2D3142' : '#E2E8F0',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.88rem', color: '#64748B' }}>
                총 {managePlaces.length}개 중 <strong>{filteredManagePlaces.length}개</strong> 검색됨
                {(manageSearch || manageCategory !== '전체') && (
                  <button
                    onClick={() => { setManageSearch(''); setManageCategory('전체'); }}
                    style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#FF9F1C', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    필터 초기화
                  </button>
                )}
              </div>
              <button onClick={loadManagePlaces} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#9094A6', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Loader size={12} /> {manageLoading ? '동기화 중...' : '새로고침'}
              </button>
            </div>

            {manageLoading
              ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
              : filteredManagePlaces.length === 0
                ? <div style={{ textAlign: 'center', padding: '60px 40px', background: '#F8FAFC', borderRadius: '20px', color: '#94A3B8', fontSize: '0.95rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🔍</div>
                  검색 결과가 없습니다.
                </div>
                : filteredManagePlaces.map(place => (
                  <div key={place.id} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#9094A6', marginTop: '2px' }}>{place.category} · {place.subCategory}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9094A6', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        📍 {place.address} {place.addressDetail && `(${place.addressDetail})`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => handleEdit(place)}
                        style={{ background: '#EEF2FF', color: '#4F46E5', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.83rem', fontWeight: 600, fontFamily: 'inherit' }}>
                        <Pencil size={13} /> 수정
                      </button>
                      <button onClick={() => handleDelete(place)}
                        style={{ background: '#FFF5F5', color: '#DC2626', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.83rem', fontWeight: 600, fontFamily: 'inherit' }}>
                        <Trash2 size={13} /> 삭제
                      </button>
                    </div>
                  </div>
                ))
            }
          </div>
        )}

        {/* Tab: 제안 검토 */}
        {tab === 'suggestions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {suggestionLoading
              ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
              : suggestions.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6', fontSize: '0.95rem' }}>대기 중인 제안이 없습니다. 🎉</div>
                : suggestions.map(s => (
                  <div key={s.id} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{s.name}</div>
                        <div style={{ fontSize: '0.82rem', color: '#9094A6', marginTop: '2px' }}>{s.category} · {s.subCategory}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => handleApprove(s)} style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                          <Check size={14} /> 승인
                        </button>
                        <button onClick={() => handleReject(s.id)} style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontFamily: 'inherit' }}>
                          <X size={14} /> 거절
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#555' }}>📍 {s.address} {s.addressDetail && `(${s.addressDetail})`}</div>
                    {s.notes && <div style={{ fontSize: '0.82rem', color: '#9094A6', background: '#F9F9F9', borderRadius: '6px', padding: '8px' }}>{s.notes}</div>}
                    {s.submittedBy && <div style={{ fontSize: '0.78rem', color: '#9094A6' }}>제안자: {s.submittedBy}</div>}
                  </div>
                ))
            }
          </div>
        )}

        {/* Tab: 유저 피드백 */}
        {tab === 'feedbacks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', color: '#9094A6' }}>총 {feedbacks.length}개의 피드백</span>
              <button onClick={loadFeedbacks} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#9094A6', fontFamily: 'inherit' }}>↻ 새로고침</button>
            </div>
            {feedbacksLoading
              ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
              : feedbacks.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6', fontSize: '0.95rem' }}>접수된 피드백이 없습니다.</div>
                : feedbacks.map(f => (
                  <div key={f.id} style={{ border: '1px solid #FFE4E6', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#FFFBFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                            background: f.type === 'delete' ? '#FECACA' : f.type === 'correction' ? '#DBEAFE' : '#F3F4F6',
                            color: f.type === 'delete' ? '#DC2626' : f.type === 'correction' ? '#2563EB' : '#6B7280'
                          }}>
                            {f.type === 'delete' ? '폐업/삭제' : f.type === 'correction' ? '정보수정' : '기타'}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{f.placeName}</span>
                        </div>
                        <div style={{ fontSize: '0.88rem', color: '#2D3142', lineHeight: 1.5, background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                          {f.message}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9094A6', marginTop: '6px' }}>접수일: {f.createdAt.split('T')[0]}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button onClick={() => handleEditFromFeedback(f.placeId)} style={{ background: '#EEF2FF', color: '#4F46E5', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit' }}>
                          장소 수정
                        </button>
                        <button 
                          onClick={() => handleDeleteFeedback(f)} 
                          style={{ background: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit' }}
                        >
                          <Trash2 size={12} /> 삭제
                        </button>
                      </div>
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    </div>

    {/* Custom Confirmation Modals */}
    {(deleteTarget || feedbackTarget) && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px'
      }}>
        <div style={{ background: '#fff', borderRadius: '24px', padding: '32px', maxWidth: '400px', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ background: '#FEF2F2', borderRadius: '16px', padding: '16px', color: '#DC2626', width: 'fit-content' }}>
            <Trash2 size={32} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.25rem', color: '#111827' }}>정말로 삭제하시겠습니까?</h3>
            <p style={{ margin: '8px 0 0 0', fontSize: '0.95rem', color: '#6B7280', lineHeight: 1.6 }}>
              {deleteTarget 
                ? <><strong style={{ color: '#111827' }}>{deleteTarget.name}</strong> 장소 데이터를 영구적으로 삭제합니다. 이 작업은 되돌릴 수 없습니다.</>
                : <>선택한 피드백을 목록에서 삭제(처리 완료)합니다.</>
              }
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button onClick={() => { setDeleteTarget(null); setFeedbackTarget(null); }}
              style={{ flex: 1, padding: '14px', background: '#F3F4F6', border: 'none', borderRadius: '12px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', color: '#4B5563' }}>
              취소
            </button>
            <button onClick={deleteTarget ? confirmDelete : confirmDeleteFeedback}
              style={{ flex: 1, padding: '14px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              삭제하기
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontWeight: 600, fontSize: '0.9rem', color: '#2D3142' }}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'linear-gradient(135deg, #FFF8EE 0%, #F0F4FF 100%)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto', fontFamily: "'Pretendard', -apple-system, sans-serif" },
  card: { background: '#fff', borderRadius: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.10)', padding: '36px 32px', width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '24px' },
  header: { display: 'flex', alignItems: 'center', gap: '14px' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#2D3142', margin: 0 },
  subtitle: { fontSize: '0.85rem', color: '#9094A6', margin: 0, marginTop: '2px' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: '10px', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none', color: '#2D3142', background: '#FAFAFA' },
  pillGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  pill: { padding: '8px 16px', background: '#F4F5F7', border: '1.5px solid #E5E7EB', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  pillActive: { padding: '8px 16px', background: '#FF9F1C', border: '1.5px solid #FF9F1C', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
  searchBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 18px', background: '#2D3142', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', minHeight: '45px' },
  submitBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', background: '#FF9F1C', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,159,28,0.3)', fontFamily: 'inherit', marginTop: '8px' },
  tabBtn: { padding: '8px 16px', background: 'transparent', border: '1.5px solid #E5E7EB', borderRadius: '999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' },
  tabActive: { background: '#FF9F1C', border: '1.5px solid #FF9F1C', color: '#fff' },
};
