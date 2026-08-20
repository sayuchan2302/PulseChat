import { useState, useEffect, useCallback } from 'react';

export interface LightboxMediaItem {
    url: string;
    type: 'IMAGE' | 'VIDEO';
    fileName?: string;
}

export interface MediaLightboxProps {
    items: LightboxMediaItem[];
    currentIndex: number;
    onClose: () => void;
    onSelectIndex: (index: number) => void;
}

export function MediaLightbox({
    items,
    currentIndex,
    onClose,
    onSelectIndex,
}: MediaLightboxProps) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    const currentItem = items[currentIndex];

    const resetTransform = useCallback(() => {
        setZoom(1);
        setRotation(0);
    }, []);

    const handleNext = useCallback(() => {
        if (currentIndex < items.length - 1) {
            onSelectIndex(currentIndex + 1);
            resetTransform();
        }
    }, [currentIndex, items.length, onSelectIndex, resetTransform]);

    const handlePrev = useCallback(() => {
        if (currentIndex > 0) {
            onSelectIndex(currentIndex - 1);
            resetTransform();
        }
    }, [currentIndex, onSelectIndex, resetTransform]);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
    const handleRotate = () => setRotation((r) => (r + 90) % 360);

    const handleDownload = () => {
        if (!currentItem) return;
        const link = document.createElement('a');
        link.href = currentItem.url;
        link.download = currentItem.fileName || 'downloaded-media';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowRight') {
                handleNext();
            } else if (e.key === 'ArrowLeft') {
                handlePrev();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, handleNext, handlePrev]);

    if (!currentItem) return null;

    return (
        <div className="media-lightbox-overlay" role="dialog" aria-label="Media viewer">
            <div className="lightbox-header">
                <span className="lightbox-counter">
                    {currentIndex + 1} / {items.length}
                </span>
                <div className="lightbox-toolbar">
                    <button type="button" onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In">
                        🔍+
                    </button>
                    <button type="button" onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out">
                        🔍-
                    </button>
                    <button type="button" onClick={handleRotate} title="Rotate 90°" aria-label="Rotate 90°">
                        ↻
                    </button>
                    <button type="button" onClick={handleDownload} title="Download" aria-label="Download">
                        ⬇
                    </button>
                    <button type="button" className="lightbox-close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
                        ✕
                    </button>
                </div>
            </div>

            <div className="lightbox-body" onClick={onClose}>
                <div className="lightbox-media-wrapper" onClick={(e) => e.stopPropagation()}>
                    {currentItem.type === 'VIDEO' ? (
                        <video
                            src={currentItem.url}
                            controls
                            autoPlay
                            className="lightbox-media video"
                            style={{
                                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            }}
                        />
                    ) : (
                        <img
                            src={currentItem.url}
                            alt={currentItem.fileName || 'Fullscreen preview'}
                            className="lightbox-media image"
                            style={{
                                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                            }}
                        />
                    )}
                </div>

                {currentIndex > 0 ? (
                    <button
                        type="button"
                        className="lightbox-nav-btn prev"
                        onClick={(e) => {
                            e.stopPropagation();
                            handlePrev();
                        }}
                        aria-label="Previous media"
                    >
                        ❮
                    </button>
                ) : null}

                {currentIndex < items.length - 1 ? (
                    <button
                        type="button"
                        className="lightbox-nav-btn next"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleNext();
                        }}
                        aria-label="Next media"
                    >
                        ❯
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export default MediaLightbox;
