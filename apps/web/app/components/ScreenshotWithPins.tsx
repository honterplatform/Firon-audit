'use client';

import { useState, useRef, useEffect } from 'react';

type ElementCoordinate = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewport: string;
};

type Finding = {
  issue: string;
  evidenceRefs?: string[];
};

type Props = {
  screenshotUrl: string;
  viewport: string;
  elementCoordinates?: Record<string, ElementCoordinate>;
  findings?: Finding[];
  onPinClick?: (selector: string, coordinate: ElementCoordinate) => void;
};

// Clean up selector to show something readable
function cleanSelector(selector: string): string {
  // Extract just the tag name (e.g., "h1", "button", "h3")
  const tagMatch = selector.match(/^([a-z]+[0-9]*)/i);
  if (tagMatch) {
    const tag = tagMatch[1].toUpperCase();
    // If it's just a tag, return it
    if (selector === tag.toLowerCase() || selector.startsWith(tag.toLowerCase() + '#')) {
      return tag;
    }
    // If it has classes/ids, show tag + simplified info
    if (selector.includes('#')) {
      const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch) {
        return `${tag} #${idMatch[1]}`;
      }
    }
    // Show tag with first class if available
    if (selector.includes('.')) {
      const firstClass = selector.split('.')[1]?.split(' ')[0]?.split(':')[0];
      if (firstClass && firstClass.length < 20) {
        return `${tag} .${firstClass}`;
      }
    }
    return tag;
  }
  return selector.length > 30 ? selector.substring(0, 30) + '...' : selector;
}

// Find finding that matches this selector
function findMatchingFinding(selector: string, findings: Finding[] = []): Finding | null {
  for (const finding of findings) {
    if (!finding.evidenceRefs) continue;
    
    for (const ref of finding.evidenceRefs) {
      // Check if evidenceRef contains this selector
      if (ref.includes('Selector:')) {
        const refSelector = ref.replace('Selector:', '').trim();
        // Exact match
        if (refSelector === selector) {
          return finding;
        }
        // Partial match (e.g., "h1" matches "h1#id.class")
        if (selector.includes(refSelector) || refSelector.includes(selector.split('#')[0].split('.')[0])) {
          return finding;
        }
      }
      // Also check if selector is mentioned in the ref
      if (ref.toLowerCase().includes(selector.toLowerCase().split('#')[0].split('.')[0])) {
        return finding;
      }
    }
  }
  return null;
}

export function ScreenshotWithPins({ screenshotUrl, viewport, elementCoordinates = {}, findings = [], onPinClick }: Props) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [hoveredPin, setHoveredPin] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter coordinates for this viewport
  const relevantCoordinates = Object.entries(elementCoordinates).filter(
    ([_, coord]) => coord.viewport === viewport
  );

  useEffect(() => {
    const img = imageRef.current;
    if (img && img.complete) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }, [screenshotUrl]);

  const handleImageLoad = () => {
    const img = imageRef.current;
    if (img) {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  if (!screenshotUrl) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ backgroundColor: '#0a211f' }}>
      <img
        ref={imageRef}
        src={screenshotUrl}
        alt={`${viewport} screenshot`}
        className="w-full h-auto rounded-lg shadow-lg"
        onLoad={handleImageLoad}
      />
      
      {imageSize && relevantCoordinates.length > 0 && (
        <div className="absolute inset-0">
          {relevantCoordinates.map(([selector, coord]) => {
            // Calculate percentage positions based on natural image size
            const xPercent = (coord.x / imageSize.width) * 100;
            const yPercent = (coord.y / imageSize.height) * 100;
            
            // Find matching finding
            const matchingFinding = findMatchingFinding(selector, findings);
            const displayText = matchingFinding 
              ? matchingFinding.issue.length > 60 
                ? matchingFinding.issue.substring(0, 60) + '...'
                : matchingFinding.issue
              : cleanSelector(selector);
            
            return (
              <div
                key={selector}
                className="absolute cursor-pointer group"
                style={{
                  left: `${xPercent}%`,
                  top: `${yPercent}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseEnter={() => setHoveredPin(selector)}
                onMouseLeave={() => setHoveredPin(null)}
                onClick={() => onPinClick?.(selector, coord)}
              >
                {/* Pin marker */}
                <div
                  className="relative"
                  style={{
                    width: '20px',
                    height: '20px',
                  }}
                >
                  {/* Outer circle (pulse animation) */}
                  <div
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{
                      backgroundColor: matchingFinding ? '#d8ff85' : '#8dfdba',
                      opacity: hoveredPin === selector ? 0.6 : 0.3,
                    }}
                  />
                  
                  {/* Inner circle */}
                  <div
                    className="absolute inset-0 rounded-full border-2 flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: hoveredPin === selector 
                        ? (matchingFinding ? '#d8ff85' : '#8dfdba')
                        : (matchingFinding ? '#d8ff85' : '#8dfdba'),
                      borderColor: '#0a211f',
                      transform: hoveredPin === selector ? 'scale(1.2)' : 'scale(1)',
                    }}
                  />
                </div>
                
                {/* Tooltip on hover */}
                {hoveredPin === selector && (
                  <div
                    className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs z-50 max-w-xs"
                    style={{
                      backgroundColor: '#0a211f',
                      color: '#d8ff85',
                      border: '1px solid #223734',
                      whiteSpace: 'normal',
                      wordWrap: 'break-word',
                    }}
                  >
                    {displayText}
                    <div
                      className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1"
                      style={{
                        width: 0,
                        height: 0,
                        borderLeft: '4px solid transparent',
                        borderRight: '4px solid transparent',
                        borderTop: '4px solid #0a211f',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
