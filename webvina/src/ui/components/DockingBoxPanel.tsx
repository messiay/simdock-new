import { useState } from 'react';
import { useDockingStore } from '../../store/dockingStore';
import { calculateBlindDockingBox, detectBindingPocket } from '../../utils/gridboxCalculator';
import '../styles/DockingBoxPanel.css';

export function DockingBoxPanel() {
    const { params, setParams, receptorFile } = useDockingStore();
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectionResult, setDetectionResult] = useState<string | null>(null);

    const handleChange = (field: string, value: string) => {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            setParams({ [field]: numValue });
        }
    };

    const handleBlindDocking = () => {
        if (!receptorFile?.content) {
            setDetectionResult('⚠️ Upload a receptor first');
            return;
        }

        const box = calculateBlindDockingBox(receptorFile.content, 10);
        setParams(box);
        setDetectionResult(`🎯 Blind: Whole protein (${box.sizeX}×${box.sizeY}×${box.sizeZ} Å)`);
    };

    const handleAutoSite = async () => {
        if (!receptorFile?.content) {
            setDetectionResult('⚠️ Upload a receptor first');
            return;
        }

        setIsDetecting(true);
        setDetectionResult('🔍 Detecting pockets...');

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            const pocket = detectBindingPocket(receptorFile.content);

            if (pocket) {
                setParams({
                    centerX: pocket.centerX,
                    centerY: pocket.centerY,
                    centerZ: pocket.centerZ,
                    sizeX: pocket.sizeX,
                    sizeY: pocket.sizeY,
                    sizeZ: pocket.sizeZ,
                });
                setDetectionResult(
                    `✅ ${pocket.pocketType} (${Math.round(pocket.confidence * 100)}% confidence)`
                );
            } else {
                setDetectionResult('⚠️ No pockets found');
            }

            setIsDetecting(false);
        }, 100);
    };

    return (
        <div className="docking-box-panel">
            <h3 className="panel-title">
                <span className="title-icon">📦</span>
                Docking Box
            </h3>

            {/* Auto-detection buttons */}
            <div className="detection-buttons">
                <button
                    className="detection-btn blind-btn"
                    onClick={handleBlindDocking}
                    disabled={!receptorFile}
                >
                    🌐 Blind Docking
                </button>
                <button
                    className="detection-btn autosite-btn"
                    onClick={handleAutoSite}
                    disabled={!receptorFile || isDetecting}
                >
                    {isDetecting ? '🔍 Detecting...' : '🎯 AutoSite'}
                </button>
            </div>

            {detectionResult && (
                <div className={`detection-result ${detectionResult.startsWith('⚠️') ? 'warning' : 'success'}`}>
                    {detectionResult}
                </div>
            )}

            <div className="box-section">
                <h4 className="section-label">Center (Å)</h4>
                <div className="coordinate-inputs">
                    <div className="coord-input">
                        <label>X</label>
                        <input
                            type="number"
                            step="0.1"
                            value={params.centerX}
                            onChange={(e) => handleChange('centerX', e.target.value)}
                        />
                    </div>
                    <div className="coord-input">
                        <label>Y</label>
                        <input
                            type="number"
                            step="0.1"
                            value={params.centerY}
                            onChange={(e) => handleChange('centerY', e.target.value)}
                        />
                    </div>
                    <div className="coord-input">
                        <label>Z</label>
                        <input
                            type="number"
                            step="0.1"
                            value={params.centerZ}
                            onChange={(e) => handleChange('centerZ', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="box-section">
                <h4 className="section-label">Size (Å)</h4>
                <div className="coordinate-inputs">
                    <div className="coord-input">
                        <label>X</label>
                        <input
                            type="number"
                            step="1"
                            min="1"
                            value={params.sizeX}
                            onChange={(e) => handleChange('sizeX', e.target.value)}
                        />
                    </div>
                    <div className="coord-input">
                        <label>Y</label>
                        <input
                            type="number"
                            step="1"
                            min="1"
                            value={params.sizeY}
                            onChange={(e) => handleChange('sizeY', e.target.value)}
                        />
                    </div>
                    <div className="coord-input">
                        <label>Z</label>
                        <input
                            type="number"
                            step="1"
                            min="1"
                            value={params.sizeZ}
                            onChange={(e) => handleChange('sizeZ', e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
