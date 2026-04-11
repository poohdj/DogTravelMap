'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { db, auth, googleProvider } from '@/lib/firebase';
import { MapPin, Plus, CheckCircle, Loader, LogOut, LogIn, Clock, Check, X, Pencil, Trash2, List } from 'lucide-react';

declare global {
  interface Window { kakao: any; daum: any; }
}

const ADMIN_EMAILS = [
  'mungspot.com@gmail.com',
  'poohdj@gmail.com',
];

const CATEGORIES: Record<string, string[]> = {
  '카페': ['디저트카페', '애견카페', '브런치카페', '루프탑카페', '기타'],
  '식당': ['한식', '중식', '일식', '양식', '분식', '패스트푸드', '기타'],
  '명소': ['공원·산책로', '해변·강변', '계곡·산', '관광지', '쇼핑몰', '기타'],
  '숙소': ['펜션', '호텔', '캠핑장', '글램핑', '기타'],
  '기타': ['병원·약국', '미용실', '기타'],
};

const REQUIREMENTS = ['견모차', '슬링백', '캐리어', '입마개', '리드줄 필수'];

const defaultForm = {
  name: '', category: '카페', subCategory: '디저트카페',
  address: '', lat: '', lng: '',
  isDogFriendly: true, requirements: [] as string[], notes: '',
};

type Place = {
  id: string; name: string; category: string; subCategory: string;
  address: string; lat: number; lng: number;
  isDogFriendly: boolean; requirements: string[]; notes: string;
  createdAt?: string;
};

type Suggestion = {
  id: string; name: string; category: string; subCategory: string;
  address: string; lat: number; lng: number;
  isDogFriendly: boolean; requirements: string[]; notes: string;
  submittedBy?: string; status: string; createdAt: string;
};

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<'add' | 'suggestions' | 'manage'>('add');

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
  }, [tab, user]);

  const loadSuggestions = async () => {
    setSuggestionLoading(true);
    try {
      const snap = await getDocs(collection(db, 'suggestions'));
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Suggestion))
        .filter(s => s.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setSuggestions(data);
    } finally { setSuggestionLoading(false); }
  };

  const loadManagePlaces = async () => {
    setManageLoading(true);
    try {
      const snap = await getDocs(collection(db, 'places'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Place));
      setManagePlaces(data);
    } finally { setManageLoading(false); }
  };

  // 수정 버튼 클릭 → 폼에 데이터 채우고 add 탭으로 이동
  const handleEdit = (place: Place) => {
    setForm({
      name: place.name,
      category: place.category,
      subCategory: place.subCategory,
      address: place.address,
      lat: String(place.lat),
      lng: String(place.lng),
      isDogFriendly: place.isDogFriendly,
      requirements: place.requirements ?? [],
      notes: place.notes ?? '',
    });
    setEditId(place.id);
    setTab('add');
    setSuccess(false);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 제안 승인
  const handleApprove = async (s: Suggestion) => {
    try {
      await addDoc(collection(db, 'places'), {
        name: s.name, category: s.category, subCategory: s.subCategory,
        address: s.address, lat: s.lat, lng: s.lng,
        isDogFriendly: s.isDogFriendly, requirements: s.requirements, notes: s.notes,
        createdAt: new Date().toISOString(),
      });
      await deleteDoc(doc(db, 'suggestions', s.id));
      setSuggestions(prev => prev.filter(x => x.id !== s.id));
    } catch { alert('승인 중 오류가 발생했습니다.'); }
  };

  const handleReject = async (id: string) => {
    try {
      await updateDoc(doc(db, 'suggestions', id), { status: 'rejected' });
      setSuggestions(prev => prev.filter(x => x.id !== id));
    } catch { alert('거절 처리 중 오류가 발생했습니다.'); }
  };

  // 카카오 주소 검색
  const openAddressSearch = () => {
    const runSearch = () => {
      new window.daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          setForm(prev => ({ ...prev, address: fullAddress }));
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(fullAddress, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK)
              setForm(prev => ({ ...prev, lat: result[0].y, lng: result[0].x }));
          });
        },
      }).open();
    };
    if (!window.daum?.Postcode) {
      const s = document.createElement('script');
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = () => {
        if (!window.kakao?.maps?.services) {
          const ms = document.createElement('script');
          ms.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services&autoload=false`;
          document.head.appendChild(ms);
          ms.onload = () => window.kakao.maps.load(runSearch);
        } else runSearch();
      };
      document.head.appendChild(s);
    } else runSearch();
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
        address: form.address, lat: parseFloat(form.lat), lng: parseFloat(form.lng),
        isDogFriendly: form.isDogFriendly, requirements: form.requirements, notes: form.notes,
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...styles.input, flex: 1 }} type="text" readOnly placeholder="아래 버튼을 눌러 주소 검색" value={form.address} />
                <button type="button" onClick={openAddressSearch} style={styles.searchBtn}><MapPin size={16} /> 주소 검색</button>
              </div>
              {form.lat && <p style={{ fontSize: '0.78rem', color: '#16A34A', marginTop: '4px' }}>✓ 좌표 자동 입력됨</p>}
            </Field>
            <Field label="애견동반 가능 *">
              <div style={styles.pillGroup}>
                <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: true }))}
                  style={form.isDogFriendly ? { ...styles.pillActive, background: '#16A34A', border: '1.5px solid #16A34A' } : styles.pill}>✅ 가능</button>
                <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: false }))}
                  style={!form.isDogFriendly ? { ...styles.pillActive, background: '#DC2626', border: '1.5px solid #DC2626' } : styles.pill}>❌ 불가/확인필요</button>
              </div>
            </Field>
            <Field label="필요 항목">
              <div style={styles.pillGroup}>
                {REQUIREMENTS.map(req => (
                  <button key={req} type="button" onClick={() => toggleRequirement(req)}
                    style={form.requirements.includes(req) ? { ...styles.pillActive, background: '#7C3AED', border: '1.5px solid #7C3AED' } : styles.pill}>🐾 {req}</button>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', color: '#9094A6' }}>총 {managePlaces.length}개의 장소</span>
              <button onClick={loadManagePlaces} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#9094A6', fontFamily: 'inherit' }}>↻ 새로고침</button>
            </div>
            {manageLoading
              ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6' }}><Loader size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
              : managePlaces.length === 0
                ? <div style={{ textAlign: 'center', padding: '40px', color: '#9094A6', fontSize: '0.95rem' }}>등록된 장소가 없습니다.</div>
                : managePlaces.map(place => (
                  <div key={place.id} style={{ border: '1px solid #E5E7EB', borderRadius: '12px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{place.name}</div>
                      <div style={{ fontSize: '0.8rem', color: '#9094A6', marginTop: '2px' }}>{place.category} · {place.subCategory}</div>
                      <div style={{ fontSize: '0.78rem', color: '#9094A6', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>📍 {place.address}</div>
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
                    <div style={{ fontSize: '0.85rem', color: '#555' }}>📍 {s.address}</div>
                    {s.notes && <div style={{ fontSize: '0.82rem', color: '#9094A6', background: '#F9F9F9', borderRadius: '6px', padding: '8px' }}>{s.notes}</div>}
                    {s.submittedBy && <div style={{ fontSize: '0.78rem', color: '#9094A6' }}>제안자: {s.submittedBy}</div>}
                  </div>
                ))
            }
          </div>
        )}
      </div>
    </div>

    {/* 삭제 확인 모달 */}
    {deleteTarget && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '20px', padding: '32px 28px', maxWidth: '360px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '2rem', textAlign: 'center' }}>🗑️</div>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: '#2D3142', textAlign: 'center' }}>장소를 삭제할까요?</h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#9094A6', textAlign: 'center', lineHeight: 1.6 }}>
            <strong style={{ color: '#2D3142' }}>{deleteTarget.name}</strong><br />
            삭제 후에는 되돌릴 수 없습니다.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setDeleteTarget(null)}
              style={{ flex: 1, padding: '12px', background: '#F4F5F7', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit', color: '#6B7280' }}>
              취소
            </button>
            <button onClick={confirmDelete}
              style={{ flex: 1, padding: '12px', background: '#DC2626', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'inherit' }}>
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
  searchBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '0 18px', background: '#2D3142', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  submitBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px', background: '#FF9F1C', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,159,28,0.3)', fontFamily: 'inherit', marginTop: '8px' },
  tabBtn: { padding: '8px 16px', background: 'transparent', border: '1.5px solid #E5E7EB', borderRadius: '999px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' },
  tabActive: { background: '#FF9F1C', border: '1.5px solid #FF9F1C', color: '#fff' },
};
