'use client';

import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MapPin, Plus, CheckCircle, Loader } from 'lucide-react';

declare global {
  interface Window {
    kakao: any;
    daum: any;
  }
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
  name: '',
  category: '카페',
  subCategory: '애견카페',
  address: '',
  lat: '',
  lng: '',
  isDogFriendly: true,
  requirements: [] as string[],
  notes: '',
};

export default function AdminPage() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // 카카오 주소 검색 팝업
  const openAddressSearch = () => {
    const script = document.getElementById('daum-postcode-script');
    const runSearch = () => {
      new window.daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          setForm(prev => ({ ...prev, address: fullAddress }));
          // 주소 → 좌표 변환
          const geocoder = new window.kakao.maps.services.Geocoder();
          geocoder.addressSearch(fullAddress, (result: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK) {
              setForm(prev => ({
                ...prev,
                lat: result[0].y,
                lng: result[0].x,
              }));
            }
          });
        },
      }).open();
    };

    if (!script) {
      const s = document.createElement('script');
      s.id = 'daum-postcode-script';
      s.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = () => {
        // 카카오 지도 SDK도 필요 (geocoder)
        if (!window.kakao?.maps?.services) {
          const mapScript = document.createElement('script');
          mapScript.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services&autoload=false`;
          document.head.appendChild(mapScript);
          mapScript.onload = () => window.kakao.maps.load(runSearch);
        } else {
          runSearch();
        }
      };
      document.head.appendChild(s);
    } else {
      runSearch();
    }
  };

  const toggleRequirement = (req: string) => {
    setForm(prev => ({
      ...prev,
      requirements: prev.requirements.includes(req)
        ? prev.requirements.filter(r => r !== req)
        : [...prev.requirements, req],
    }));
  };

  const handleCategoryChange = (cat: string) => {
    setForm(prev => ({
      ...prev,
      category: cat,
      subCategory: CATEGORIES[cat][0],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.lat || !form.lng) {
      setError('주소 검색을 통해 위치를 먼저 지정해 주세요.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'places'), {
        name: form.name,
        category: form.category,
        subCategory: form.subCategory,
        address: form.address,
        lat: parseFloat(form.lat),
        lng: parseFloat(form.lng),
        isDogFriendly: form.isDogFriendly,
        requirements: form.requirements,
        notes: form.notes,
        createdAt: new Date().toISOString(),
      });
      setSuccess(true);
      setForm(defaultForm);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setError('저장 중 오류가 발생했습니다. Firebase 설정을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page} className="admin-page-body">
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <MapPin size={28} color="#FF9F1C" />
          <div>
            <h1 style={styles.title}>멍스팟 장소 등록</h1>
            <p style={styles.subtitle}>새로운 장소를 Firestore DB에 저장합니다.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>

          {/* 장소명 */}
          <Field label="장소명 *">
            <input
              style={styles.input}
              type="text"
              required
              placeholder="예: 멍멍 카페 안산점"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
          </Field>

          {/* 대분류 */}
          <Field label="대분류 *">
            <div style={styles.pillGroup}>
              {Object.keys(CATEGORIES).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryChange(cat)}
                  style={form.category === cat ? styles.pillActive : styles.pill}
                >
                  {cat}
                </button>
              ))}
            </div>
          </Field>

          {/* 소분류 */}
          <Field label="소분류 *">
            <div style={styles.pillGroup}>
              {CATEGORIES[form.category].map(sub => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, subCategory: sub }))}
                  style={form.subCategory === sub ? { ...styles.pillActive, background: '#6D28D9', borderColor: '#6D28D9' } : styles.pill}
                >
                  {sub}
                </button>
              ))}
            </div>
          </Field>

          {/* 주소 */}
          <Field label="주소 *">
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                type="text"
                readOnly
                placeholder="아래 버튼을 눌러 주소를 검색하세요"
                value={form.address}
              />
              <button type="button" onClick={openAddressSearch} style={styles.searchBtn}>
                <MapPin size={16} /> 주소 검색
              </button>
            </div>
            {form.lat && (
              <p style={{ fontSize: '0.78rem', color: '#16A34A', marginTop: '4px' }}>
                ✓ 좌표 자동 입력됨 (위도 {parseFloat(form.lat).toFixed(5)}, 경도 {parseFloat(form.lng).toFixed(5)})
              </p>
            )}
          </Field>

          {/* 애견동반 여부 */}
          <Field label="애견동반 가능 여부 *">
            <div style={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, isDogFriendly: true }))}
                style={form.isDogFriendly ? { ...styles.pillActive, background: '#16A34A', borderColor: '#16A34A' } : styles.pill}
              >
                ✅ 가능
              </button>
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, isDogFriendly: false }))}
                style={!form.isDogFriendly ? { ...styles.pillActive, background: '#DC2626', borderColor: '#DC2626' } : styles.pill}
              >
                ❌ 불가능 / 확인 필요
              </button>
            </div>
          </Field>

          {/* 필요항목 */}
          <Field label="필요 항목 (복수 선택 가능)">
            <div style={styles.pillGroup}>
              {REQUIREMENTS.map(req => (
                <button
                  key={req}
                  type="button"
                  onClick={() => toggleRequirement(req)}
                  style={form.requirements.includes(req)
                    ? { ...styles.pillActive, background: '#7C3AED', borderColor: '#7C3AED' }
                    : styles.pill}
                >
                  🐾 {req}
                </button>
              ))}
            </div>
          </Field>

          {/* 메모 */}
          <Field label="메모 (선택)">
            <textarea
              style={{ ...styles.input, height: '80px', resize: 'vertical' }}
              placeholder="예: 야외 테라스만 입장 가능, 소형견만 허용 등"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </Field>

          {error && (
            <p style={{ color: '#DC2626', fontSize: '0.9rem', padding: '12px', background: '#FFF5F5', borderRadius: '8px' }}>
              ⚠️ {error}
            </p>
          )}

          {success && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16A34A', padding: '12px', background: '#F0FDF4', borderRadius: '8px' }}>
              <CheckCircle size={20} />
              <span style={{ fontWeight: 600 }}>저장 완료! 지도에 반영됩니다.</span>
            </div>
          )}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading
              ? <><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> 저장 중...</>
              : <><Plus size={20} /> 장소 저장하기</>}
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
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FFF8EE 0%, #F0F4FF 100%)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '40px 16px',
    overflowY: 'auto',
    fontFamily: "'Pretendard', -apple-system, sans-serif",
  },
  card: {
    background: '#fff',
    borderRadius: '24px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.10)',
    padding: '36px 32px',
    width: '100%',
    maxWidth: '560px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#2D3142',
    margin: 0,
  },
  subtitle: {
    fontSize: '0.85rem',
    color: '#9094A6',
    margin: 0,
    marginTop: '2px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid #E5E7EB',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    outline: 'none',
    color: '#2D3142',
    background: '#FAFAFA',
  },
  pillGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  pill: {
    padding: '8px 16px',
    background: '#F4F5F7',
    border: '1.5px solid #E5E7EB',
    borderRadius: '999px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#6B7280',
    cursor: 'pointer',
  },
  pillActive: {
    padding: '8px 16px',
    background: '#FF9F1C',
    border: '1.5px solid #FF9F1C',
    borderRadius: '999px',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#fff',
    cursor: 'pointer',
  },
  searchBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 18px',
    background: '#2D3142',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
  },
  submitBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px',
    background: '#FF9F1C',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(255,159,28,0.3)',
    fontFamily: 'inherit',
    marginTop: '8px',
  },
};
