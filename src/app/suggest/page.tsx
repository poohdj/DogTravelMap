'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, Send, CheckCircle, Loader, ArrowLeft, Info, Star, ShieldCheck, Mail } from 'lucide-react';

declare global {
  interface Window { kakao: any; daum: any; }
}

const CATEGORIES: Record<string, string[]> = {
  '카페': ['애견 동반 카페', '애견 전용 카페(운동장/놀이터)'],
  '식당': ['한식', '중식', '일식', '양식', '분식', '고기/구이류', '기타'],
  '명소': ['공원·산책로', '해변·강변', '계곡·산', '관광지', '쇼핑몰', '기타'],
  '숙소': ['펜션', '호텔', '캠핑장', '글램핑', '기타'],
  '기타': ['동물병원', '약국', '애견미용실', '반려용품점', '기타'],
};

const FACILITIES = [
  '야외/테라스',
  '단독룸/프라이빗',
  '대형견 입장 가능',
  '오프리쉬(목줄해제) 가능',
  '베이커리/간단한 식사',
  '전용 주차장'
];

const REQUIREMENTS = [
  '리드줄 필수',
  '실내 바닥 보행 금지(안고 있어야 함)',
  '슬링백 지참',         // 머리가 노출될 수 있는 형태
  '캐리어(하드/소프트) 필수', // 뚜껑이 닫히는 형태
  '견모차(개모차) 필수',
  '입마개 필수(맹견/예민견)'
];

const defaultForm = {
  name: '', category: '카페', subCategory: '애견 동반 카페',
  address: '', addressDetail: '', lat: '', lng: '',
  isDogFriendly: true, requirements: [] as string[],
  facilities: [] as string[],
  notes: '', submittedBy: '',
};

export default function SuggestPage() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

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
    
    if (!form.name.trim()) { setError('장소 이름을 입력해 주세요.'); return; }
    if (!form.lat || !form.lng) { setError('주소 검색을 통해 정확한 위치를 지정해 주세요.'); return; }
    
    setLoading(true);
    try {
      console.log('Submitting suggestion...', form);
      const docRef = await addDoc(collection(db, 'suggestions'), {
        name: form.name.trim(), 
        category: form.category, 
        subCategory: form.subCategory,
        address: form.address, 
        addressDetail: form.addressDetail.trim(),
        lat: parseFloat(form.lat), 
        lng: parseFloat(form.lng),
        isDogFriendly: form.isDogFriendly, 
        requirements: form.requirements,
        facilities: form.facilities,
        notes: form.notes.trim(), 
        submittedBy: form.submittedBy.trim() || '익명 제안자',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      console.log('Suggestion saved with ID:', docRef.id);
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(`제출 중 문제가 발생했습니다: ${err.message || '데이터베이스 연결 확인 필요'}`);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={styles.page} className="admin-page-body">
        <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center', padding: '60px 40px', gap: '24px' }}>
          <div style={{ background: '#F0FDF4', padding: '24px', borderRadius: '100px' }}>
            <CheckCircle size={64} color="#16A34A" />
          </div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2D3142' }}>제안이 성공적으로 전달되었습니다! 🐾</h2>
          <p style={{ fontSize: '1rem', color: '#9094A6', lineHeight: 1.8 }}>
            소중한 제보 감사합니다.<br />
            관리자가 꼼꼼히 검토한 후 지도에 등록해 드릴게요.<br />
            우리와 강아지들이 함께할 수 있는 공간이 하나 더 늘어났네요!
          </p>
          <div style={{ height: '20px' }}></div>
          <a href="/" style={{ ...styles.submitBtn, textDecoration: 'none', width: '240px', justifyContent: 'center', transform: 'none' }}>
            <ArrowLeft size={18} /> 지도로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page} className="admin-page-body">
      <div style={{ ...styles.card, background: 'transparent', boxShadow: 'none', padding: 0, gap: '32px' }}>
        
        {/* Header Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <a href="/" style={styles.backLink}><ArrowLeft size={20} /> 지도로 돌아가기</a>
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#2D3142', letterSpacing: '-0.02em' }}>장소 제안하기 🦴</h1>
          <p style={{ fontSize: '1.05rem', color: '#6B7280', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
            아직 멍스팟에 없는 우리만의 아지트가 있나요? <br />
            다른 분들과 공유해 보세요!
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          
          {/* Section 1: Basic Info */}
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}><Star size={18} color="#FF9F1C" /> 기본 정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <Field label="장소명 *">
                <input style={styles.input} type="text" required placeholder="예: 해피멍 카페 송도점"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </Field>

              <Field label="카테고리 분류 *">
                <div style={styles.pillGroup}>
                  {Object.keys(CATEGORIES).map(cat => (
                    <button key={cat} type="button" onClick={() => handleCategoryChange(cat)}
                      className={form.category === cat ? 'active' : ''}
                      style={{ ...styles.pill, ...(form.category === cat ? styles.pillActive : {}) }}>{cat}</button>
                  ))}
                </div>
                <div style={{ ...styles.pillGroup, marginTop: '8px' }}>
                  {CATEGORIES[form.category].map(sub => (
                    <button key={sub} type="button" onClick={() => setForm(p => ({ ...p, subCategory: sub }))}
                      style={{ ...styles.pill, fontSize: '0.8rem', ...(form.subCategory === sub ? { ...styles.pillActive, background: '#6D28D9', borderColor: '#6D28D9' } : {}) }}>{sub}</button>
                  ))}
                </div>
              </Field>
            </div>
          </section>

          {/* Section 2: Location */}
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}><MapPin size={18} color="#EF4444" /> 위치 정보</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input style={{ ...styles.input, flex: 1 }} type="text" readOnly placeholder="버튼을 눌러 주소를 검색하세요" value={form.address} />
              <button type="button" onClick={openAddressSearch} style={styles.searchBtn}><MapPin size={16} /> 검색</button>
            </div>
            {form.lat && <div style={{ fontSize: '0.8rem', color: '#16A34A', marginTop: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4' }}> <ShieldCheck size={14}/> 위치가 확인되었습니다.</div>}
            <div style={{ marginTop: '16px' }}>
              <Field label="상세 주소 (층, 호수 등)">
                <input style={styles.input} type="text" placeholder="예: 2층, 102호"
                  value={form.addressDetail} onChange={e => setForm(p => ({ ...p, addressDetail: e.target.value }))} />
              </Field>
            </div>
          </section>

          {/* Section 3: Details */}
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}><Info size={18} color="#7C3AED" /> 상세 정보</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <Field label="직접 확인해 보셨나요? *">
                <div style={{ ...styles.pillGroup, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: true }))}
                    style={{ ...styles.pill, padding: '12px', borderRadius: '12px', ...(form.isDogFriendly ? { ...styles.pillActive, background: '#16A34A', borderColor: '#16A34A' } : {}) }}>🏢 직접 확인 완료</button>
                  <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: false }))}
                    style={{ ...styles.pill, padding: '12px', borderRadius: '12px', ...(!form.isDogFriendly ? { ...styles.pillActive, background: '#6B7280', borderColor: '#6B7280' } : {}) }}>🔍 인터넷 정보</button>
                </div>
              </Field>

              <Field label="동반 시 지켜야 할 규정 (중복 선택)">
                <div style={styles.pillGroup}>
                  {REQUIREMENTS.map(req => (
                    <button key={req} type="button" onClick={() => toggleRequirement(req)}
                      style={{ ...styles.pill, borderRadius: '8px', fontSize: '0.8rem', ...(form.requirements.includes(req) ? { ...styles.pillActive, background: '#7C3AED', borderColor: '#7C3AED' } : {}) }}>🔖 {req}</button>
                  ))}
                </div>
              </Field>

              <Field label="장소의 장점/특징 (중복 선택)">
                <div style={styles.pillGroup}>
                  {FACILITIES.map(fac => (
                    <button key={fac} type="button"
                      onClick={() => setForm(p => ({
                        ...p,
                        facilities: p.facilities.includes(fac) ? p.facilities.filter(f => f !== fac) : [...p.facilities, fac]
                      }))}
                      style={{ ...styles.pill, borderRadius: '8px', fontSize: '0.8rem', ...(form.facilities.includes(fac) ? { ...styles.pillActive, background: '#059669', borderColor: '#059669' } : {}) }}>✨ {fac}</button>
                  ))}
                </div>
              </Field>

              <Field label="추가로 알리고 싶은 내용">
                <textarea style={{ ...styles.input, height: '100px', resize: 'none' }}
                  placeholder="예: 소형견 전용 구역이 따로 있어요! 사장님이 강아지를 아주 좋아하세요."
                  value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </Field>
            </div>
          </section>

          {/* Section 4: Contact */}
          <section style={styles.sectionCard}>
            <div style={styles.sectionHeader}><Mail size={18} color="#4F46E5" /> 작성자 정보</div>
            <p style={{ fontSize: '0.82rem', color: '#9094A6', marginBottom: '12px' }}>승인 및 등록 소식을 알려드리는 데 사용됩니다.</p>
            <input style={styles.input} type="email" placeholder="알림받을 이메일 주소 (선택)"
              value={form.submittedBy} onChange={e => setForm(p => ({ ...p, submittedBy: e.target.value }))} />
          </section>

          {error && <p style={{ color: '#DC2626', fontSize: '0.9rem', textAlign: 'center', padding: '12px', background: '#FFF5F5', borderRadius: '12px', border: '1px solid #FECACA' }}>⚠️ {error}</p>}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading
              ? <><Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> 처리 중...</>
              : <><Send size={20} /> 정성껏 제안 제출하기</>}
          </button>
          
          <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94A3B8', marginTop: '10px' }}>
            제안해주신 내용은 멍스팟 팀의 검토 후 등록됩니다.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <label style={{ fontWeight: 700, fontSize: '0.92rem', color: '#374151' }}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#FDFCFB', backgroundImage: 'radial-gradient(#FFEECC 1px, transparent 1px)', backgroundSize: '24px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px', overflowY: 'auto', fontFamily: "'Pretendard', -apple-system, sans-serif" },
  card: { width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '24px' },
  sectionCard: { background: '#fff', borderRadius: '24px', padding: '32px', boxShadow: '0 4px 30px rgba(0,0,0,0.03)', border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '16px' },
  sectionHeader: { fontSize: '1.05rem', fontWeight: 800, color: '#2D3142', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  backLink: { padding: '8px 16px', background: '#fff', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#6B7280', textDecoration: 'none', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content' },
  form: { display: 'flex', flexDirection: 'column', gap: '24px' },
  input: { width: '100%', padding: '14px 16px', border: '1.5px solid #F1F5F9', borderRadius: '14px', fontSize: '0.98rem', fontFamily: 'inherit', outline: 'none', color: '#1F2937', background: '#F8FAFC', transition: 'all 0.2s ease' },
  pillGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  pill: { padding: '10px 18px', background: '#F1F5F9', border: '1.5px solid transparent', borderRadius: '999px', fontSize: '0.88rem', fontWeight: 700, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)' },
  pillActive: { background: '#FFF8EE', border: '1.5px solid #FF9F1C', color: '#FF9F1C' },
  searchBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '0 24px', background: '#2D3142', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  submitBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '18px', background: '#FF9F1C', color: '#fff', border: 'none', borderRadius: '18px', fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 8px 24px rgba(255,159,28,0.25)', fontFamily: 'inherit', marginTop: '12px', transition: 'all 0.2s ease' },
};
