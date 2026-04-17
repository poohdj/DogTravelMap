import { ImageResponse } from 'next/og';

// App Router icon generation
// Route segment config
export const runtime = 'edge';

// Image metadata
export const size = {
  width: 48,
  height: 48,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          fontSize: 24,
          background: 'black',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
        }}
      >
        <div style={{ display: 'flex', position: 'relative', width: 28, height: 28 }}>
            {/* Simple paw representation in SVG-like CSS */}
            <div style={{ position: 'absolute', left: 4, top: 4, width: 6, height: 8, background: 'white', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', right: 4, top: 4, width: 6, height: 8, background: 'white', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', left: 0, top: 12, width: 6, height: 8, background: 'white', borderRadius: '50%', transform: 'rotate(-30deg)' }} />
            <div style={{ position: 'absolute', right: 0, top: 12, width: 6, height: 8, background: 'white', borderRadius: '50%', transform: 'rotate(30deg)' }} />
            <div style={{ position: 'absolute', left: '15%', top: '55%', width: 20, height: 12, background: 'white', borderRadius: '8px 8px 12px 12px' }} />
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  );
}
