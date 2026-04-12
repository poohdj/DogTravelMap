'use client';

import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, Send, CheckCircle, Loader, ArrowLeft } from 'lucide-react';

declare global {
  interface Window { kakao: any; daum: any; }
}

const CATEGORIES: Record<string, string[]> = {
  '카페':  ['애견카페', '디저트카페', '브런치카페', '루프탑카페', '기타'],
  '식당':  ['한식', '중식', '일식', '양식', '분식', '패스트푸드', '기타'],
  '명소':  ['공원·산책로', '해변·강변', '계곡·산', '관광지', '쇼핑몰', '기타'],
  '숙소':  ['펜션', '호텔', '캠핑장', '글램핑', '기타'],
  '기타':  ['병원·약국', '미용실', '기타'],
};

const REQUIREMENTS = ['견모차', '슬링백', '캐리어', '입마개', '리드줄 필수'];

const defaultForm = {
  name: '', category: '카페', subCategory: '애견카페',
  address: '', addressDetail: '', lat: '', lng: '',
  isDogFriendly: true, requirements: [] as string[],
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
    if (!form.lat || !form.lng) { setError('주소 검색으로 위치를 먼저 입력해 주세요.'); return; }
    setLoading(true);
    try {
      await addDoc(collection(db, 'suggestions'), {
        name: form.name, category: form.category, subCategory: form.subCategory,
        address: form.address, addressDetail: form.addressDetail,
        lat: parseFloat(form.lat), lng: parseFloat(form.lng),
        isDogFriendly: form.isDogFriendly, requirements: form.requirements,
        notes: form.notes, submittedBy: form.submittedBy || '익명',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setDone(true);
    } catch {
      setError('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }} className="admin-page-body">
        <div style={{ ...styles.card, alignItems: 'center', textAlign: 'center', gap: '20px' }}>
          <CheckCircle size={56} color="#16A34A" />
          <h2 style={{ ...styles.title }}>제안해 주셔서 감사합니다! 🐾</h2>
          <p style={{ fontSize: '0.92rem', color: '#9094A6', lineHeight: 1.7 }}>
            소중한 제안이 접수되었습니다.<br />
            검토 후 지도에 반영해 드리겠습니다.<br />
            보통 2~3일 내에 처리됩니다.
          </p>
          <a href="/" style={{ ...styles.submitBtn, textDecoration: 'none', width: '100%', justifyContent: 'center' }}>
            <ArrowLeft size={18} /> 지도로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page} className="admin-page-body">
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <a href="/" style={{ color: '#9094A6', display: 'flex', alignItems: 'center' }}><ArrowLeft size={20} /></a>
          <div>
            <h1 style={styles.title}>장소 등록 제안하기</h1>
            <p style={styles.subtitle}>애견 동반 가능한 장소를 알려주세요! 검토 후 지도에 추가합니다.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>

          <Field label="장소명 *">
            <input style={styles.input} type="text" required placeholder="예: 강남 멍멍 카페"
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
                  style={form.subCategory === sub ? { ...styles.pillActive, background: '#6D28D9', borderColor: '#6D28D9' } : styles.pill}>{sub}</button>
              ))}
            </div>
          </Field>

          <Field label="주소 *">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...styles.input, flex: 1 }} type="text" readOnly placeholder="아래 버튼으로 주소 검색" value={form.address} />
              <button type="button" onClick={openAddressSearch} style={styles.searchBtn}><MapPin size={16} /> 주소 검색</button>
            </div>
            {form.lat && <p style={{ fontSize: '0.78rem', color: '#16A34A', marginTop: '4px' }}>✓ 위치 자동 입력됨</p>}
            <input style={{ ...styles.input, marginTop: '8px' }} type="text" placeholder="상세 주소 입력 (예: 102호, 2층)"
              value={form.addressDetail} onChange={e => setForm(p => ({ ...p, addressDetail: e.target.value }))} />
          </Field>

          <Field label="애견동반 가능 여부 *">
            <div style={styles.pillGroup}>
              <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: true }))}
                style={form.isDogFriendly ? { ...styles.pillActive, background: '#16A34A', borderColor: '#16A34A' } : styles.pill}>✅ 가능</button>
              <button type="button" onClick={() => setForm(p => ({ ...p, isDogFriendly: false }))}
                style={!form.isDogFriendly ? { ...styles.pillActive, background: '#DC2626', borderColor: '#DC2626' } : styles.pill}>❌ 불가 / 확인 필요</button>
            </div>
          </Field>

          <Field label="필요 항목 (복수 선택 가능)">
            <div style={styles.pillGroup}>
              {REQUIREMENTS.map(req => (
                <button key={req} type="button" onClick={() => toggleRequirement(req)}
                  style={form.requirements.includes(req) ? { ...styles.pillActive, background: '#7C3AED', borderColor: '#7C3AED' } : styles.pill}>🐾 {req}</button>
              ))}
            </div>
          </Field>

          <Field label="추가 메모 (선택)">
            <textarea style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="예: 소형견만 가능, 야외 테라스만 허용 등"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </Field>

          <Field label="연락처 이메일 (선택, 승인 시 알림 가능)">
            <input style={styles.input} type="email" placeholder="example@email.com (생략 가능)"
              value={form.submittedBy} onChange={e => setForm(p => ({ ...p, submittedBy: e.target.value }))} />
          </Field>

          {error && <p style={{ color: '#DC2626', fontSize: '0.9rem', padding: '12px', background: '#FFF5F5', borderRadius: '8px' }}>⚠️ {error}</p>}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading
              ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> 제출 중...</>
              : <><Send size={20} /> 제안 제출하기</>}
          </button>
        </form>
      </div>
    </div>
  );
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
  header: { display: 'flex', alignItems: 'flex-start', gap: '14px' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#2D3142', margin: 0 },
  subtitle: { fontSize: '0.85rem', color: '#9094A6', margin: 0, marginTop: '4px', lineHeight: 1.5 },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  input: { width: '100%', padding: '12px 14px', border: '1.5px solid #E5E7EB', borderRadius: '10px', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none', color: '#2D3142', background: '#FAFAFA' },
  pillGroup: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  pill: { padding: '8px 16px', background: '#F4F5F7', border: '1.5px solid #E5E7EB', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#6B7280', cursor: 'pointer', fontFamily: 'inherit' },
  pillActive: { padding: '8px 16px', background: '#FF9F1C', border: '1.5px solid #FF9F1C', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' },
  searchBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '0 18px', background: '#2D3142', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' },
  submitBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', background: '#FF9F1C', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,159,28,0.3)', fontFamily: 'inherit', marginTop: '8px' },
};
