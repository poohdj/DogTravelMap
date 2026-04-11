'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MapPin } from 'lucide-react';
// import { collection, getDocs } from 'firebase/firestore';
// import { db } from '@/lib/firebase';

// Add type for Kakao Map so typescript doesn't complain
declare global {
  interface Window {
    kakao: any;
  }
}

interface Place {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

// Temporary hardcoded data as requested
const MOCK_PLACES: Place[] = [
  {
    id: '1',
    name: '벤지가 편하게 쉬는 카페',
    category: '애견 동반 카페',
    lat: 37.3225, // Ansan area coordinate
    lng: 126.8315,
  },
  {
    id: '2',
    name: '밤콩이 뛰노는 산책로',
    category: '산책로/공원',
    lat: 37.3210, // Ansan area coordinate
    lng: 126.8290,
  }
];

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);

  // 1. Fetch places - simulated or real Firestore
  useEffect(() => {
    async function fetchPlaces() {
      try {
        // [TODO] Real DB integration:
        // const querySnapshot = await getDocs(collection(db, 'places'));
        // const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Place[];
        // setPlaces(data);
        
        // For MVP initial rendering: show hardcoded data
        setPlaces(MOCK_PLACES);
      } catch (error) {
        console.error("Error fetching places:", error);
      }
    }
    fetchPlaces();
  }, []);

  // 2. Initialize Kakao Map
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current) return;
      window.kakao.maps.load(() => {
        const center = new window.kakao.maps.LatLng(37.3218778, 126.8308848);
        const options = {
          center,
          level: 4,
        };
        const newMap = new window.kakao.maps.Map(mapRef.current, options);
        setMap(newMap);
      });
    };

    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_API_KEY}&libraries=services,clusterer&autoload=false`;
      document.head.appendChild(script);
      script.onload = () => initMap();
    }
  }, []);

  // 3. Render Markers when map and places are ready
  useEffect(() => {
    if (!map || places.length === 0) return;

    const markers: any[] = [];

    places.forEach((place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      
      const marker = new window.kakao.maps.Marker({
        position,
        clickable: true
      });

      marker.setMap(map);
      markers.push(marker);

      window.kakao.maps.event.addListener(marker, 'click', () => {
        setSelectedPlace(place);
        map.panTo(position); // Center map to marker
      });
    });

    return () => {
      // Cleanup markers on unmount or updates
      markers.forEach(marker => marker.setMap(null));
    };
  }, [map, places]);

  return (
    <main className="map-container">
      {/* Map Rendering Container */}
      <div id="kakao-map" ref={mapRef}></div>

      {/* Place Info Bottom Sheet */}
      {selectedPlace && (
        <div className="place-info-card">
          <button 
            className="close-btn" 
            onClick={() => setSelectedPlace(null)}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
          <span className="place-category">{selectedPlace.category}</span>
          <h2 className="place-title">{selectedPlace.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '8px' }}>
             <MapPin size={16} />
             <span>안산시 어딘가... (상세주소 연동 필요)</span>
          </div>
        </div>
      )}
    </main>
  );
}
