import { useState, useRef } from 'react';
import { rdkitService, type MolecularProperties } from '../../services/rdkitService';
import { openBabelService, INPUT_FORMATS, OUTPUT_FORMATS, type SupportedInputFormat, type SupportedOutputFormat } from '../../services/openBabelService';
import { pdbService } from '../../services/pdbService';
import { pubchemService, type CompoundInfo } from '../../services/pubchemService';
import { MolecularPropertiesDisplay } from './MolecularProperties';
import { useDockingStore } from '../../store/dockingStore';
import {
    TestTube2,
    Dna,
    Pill,
    Search,
    Download,
    CheckCircle,
    AlertTriangle,
    FileText,
    RefreshCw,
    ArrowRight,
    FolderOpen,
    Zap,
    Target,
    Loader2
} from 'lucide-react';
import '../styles/PrepPanel.css';

// Common drug SMILES examples
const EXAMPLE_MOLECULES = [
    { name: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
    { name: 'Ibuprofen', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O' },
    { name: 'Caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
    { name: 'Acetaminophen', smiles: 'CC(=O)NC1=CC=C(C=C1)O' },
    { name: 'Metformin', smiles: 'CN(C)C(=N)NC(=N)N' },
];

// Example PDB IDs
const EXAMPLE_PDBS = [
    { id: '1A7H', name: 'HIV-1 Protease' },
    { id: '3HTB', name: 'Thrombin' },
    { id: '4HJO', name: 'EGFR Kinase' },
    { id: '2HYY', name: 'COX-2' },
];

// Example PubChem compounds
const EXAMPLE_COMPOUNDS = [
    { query: '2244', name: 'Aspirin' },
    { query: '2519', name: 'Caffeine' },
    { query: '3672', name: 'Ibuprofen' },
    { query: '5743', name: 'Morphine' },
];

export function PrepPanel() {
    // SMILES state
    const [smilesInput, setSmilesInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [svgDepiction, setSvgDepiction] = useState<string | null>(null);
    const [properties, setProperties] = useState<MolecularProperties | null>(null);
    const [processedData, setProcessedData] = useState<{
        canonicalSmiles?: string;
        pdbBlock?: string;
    } | null>(null);

    // PDB import state
    const [pdbInput, setPdbInput] = useState('');
    const [isFetchingPdb, setIsFetchingPdb] = useState(false);
    const [pdbResult, setPdbResult] = useState<{ title: string; content: string } | null>(null);
    const [pdbError, setPdbError] = useState<string | null>(null);

    // PubChem import state
    const [pubchemInput, setPubchemInput] = useState('');
    const [isFetchingPubchem, setIsFetchingPubchem] = useState(false);
    const [pubchemResult, setPubchemResult] = useState<{ name: string; content: string; format: string; properties?: CompoundInfo } | null>(null);
    const [pubchemError, setPubchemError] = useState<string | null>(null);

    // Format conversion state
    const [conversionFile, setConversionFile] = useState<File | null>(null);
    const [conversionFileContent, setConversionFileContent] = useState<string>('');
    const [inputFormat, setInputFormat] = useState<SupportedInputFormat>('pdb');
    const [outputFormat, setOutputFormat] = useState<SupportedOutputFormat>('pdbqt');
    const [isConverting, setIsConverting] = useState(false);
    const [conversionResult, setConversionResult] = useState<string | null>(null);
    const [conversionError, setConversionError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { setLigandFile, setReceptorFile, setActiveTab } = useDockingStore();

    // Services are initialized lazily when needed using init-on-demand patterns.
    // No useEffect() is used here to prevent startup blocks.

    // PDB Import Handler
    const handleFetchPDB = async () => {
        if (!pdbInput.trim()) {
            setPdbError('Please enter a PDB ID');
            return;
        }

        setIsFetchingPdb(true);
        setPdbError(null);
        setPdbResult(null);

        const result = await pdbService.fetchPDB(pdbInput.trim());

        if (result.success && result.content) {
            setPdbResult({ title: result.title || (result as any).pdbId || 'Unknown', content: result.content });
        } else {
            setPdbError(result.error || 'Failed to fetch PDB');
        }

        setIsFetchingPdb(false);
    };

    const handleUsePdbAsReceptor = () => {
        if (!pdbResult) return;
        setReceptorFile({
            name: `${pdbInput.toUpperCase()}.pdb`,
            content: pdbResult.content,
            format: 'pdb',
        });
        setActiveTab('input');
    };

    // PubChem Import Handler
    const handleFetchPubChem = async () => {
        if (!pubchemInput.trim()) {
            setPubchemError('Please enter a CID or compound name');
            return;
        }

        setIsFetchingPubchem(true);
        setPubchemError(null);
        setPubchemResult(null);

        const result = await pubchemService.fetchCompound(pubchemInput.trim());

        if (result.success && result.content) {
            setPubchemResult({
                name: result.name || `CID ${result.cid}`,
                content: result.content,
                format: 'sdf',
                properties: result.properties,
            });
        } else {
            setPubchemError(result.error || 'Failed to fetch compound');
        }

        setIsFetchingPubchem(false);
    };

    const handleUsePubchemAsLigand = async () => {
        if (!pubchemResult) return;

        // Use lightweight JS converter purely for speed (User Request: Revert to when it was fast)
        setIsFetchingPubchem(true);

        // Instant yield to show spinner
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            console.info('[PrepPanel] Using Fast SDF Converter (JS)');
            const { sdfToPdbqt } = await import('../../utils/sdfConverter');
            const pdbqtContent = sdfToPdbqt(pubchemResult.content);

            setLigandFile({
                name: `${pubchemResult.name.replace(/\s+/g, '_')}.pdbqt`,
                content: pdbqtContent,
                format: 'pdbqt',
            });

        } catch (e) {
            console.error('[PrepPanel] Conversion error', e);
        }

        setIsFetchingPubchem(false);
        setActiveTab('input');
    };

    // SMILES Processing
    const handleProcessSMILES = async () => {
        if (!smilesInput.trim()) {
            setError('Please enter a SMILES string');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setSvgDepiction(null);
        setProperties(null);
        setProcessedData(null);

        // Yield for UI update
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const result = await rdkitService.processSMILES(smilesInput.trim());

            if (!result.success) {
                setError(result.error || 'Failed to process SMILES');
                return;
            }

            setSvgDepiction(result.svg || null);
            setProperties(result.properties || null);
            setProcessedData({
                canonicalSmiles: result.canonicalSmiles,
                pdbBlock: result.pdbBlock,
            });
        } catch (err) {
            setError(`Processing error: ${err}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUseAsLigand = () => {
        if (!processedData?.pdbBlock) {
            setError('No 3D structure available');
            return;
        }

        setLigandFile({
            name: `${processedData.canonicalSmiles?.substring(0, 20) || 'ligand'}.pdb`,
            content: processedData.pdbBlock,
            format: 'pdb',
        });

        setActiveTab('input');
    };

    // Format conversion handlers
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setConversionFile(file);
        setConversionResult(null);
        setConversionError(null);

        const content = await file.text();
        setConversionFileContent(content);

        const detectedFormat = openBabelService.detectFormat(file.name, content);
        if (detectedFormat) {
            setInputFormat(detectedFormat);
        }
    };

    const handleConvert = async () => {
        if (!conversionFileContent) {
            setConversionError('Please select a file to convert');
            return;
        }

        setIsConverting(true);
        setConversionError(null);
        setConversionResult(null);

        try {
            const result = await openBabelService.convert(
                conversionFileContent,
                inputFormat,
                outputFormat
            );

            if (result.success && result.output) {
                setConversionResult(result.output);
            } else {
                setConversionError(result.error || 'Conversion failed');
            }
        } catch (err) {
            setConversionError(`Conversion error: ${err}`);
        } finally {
            setIsConverting(false);
        }
    };

    const handleUseConvertedAsLigand = () => {
        if (!conversionResult) return;
        setLigandFile({
            name: `converted.${outputFormat}`,
            content: conversionResult,
            format: outputFormat,
            loading: false
        });
        setActiveTab('input');
    };

    const handleUseConvertedAsReceptor = () => {
        if (!conversionResult) return;
        setReceptorFile({
            name: `converted.${outputFormat}`,
            content: conversionResult,
            format: outputFormat,
            loading: false
        });
        setActiveTab('input');
    };

    const handleDownloadConverted = () => {
        if (!conversionResult) return;
        const blob = new Blob([conversionResult], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `converted.${outputFormat}`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="prep-panel">
            <div className="prep-header">
                <h2><TestTube2 style={{ verticalAlign: 'middle', marginRight: '10px' }} size={32} /> Molecule Import</h2>
                <p>Import receptors from PDB, ligands from PubChem, or process SMILES</p>
            </div>

            {/* PDB Import Section */}
            <div className="import-section">
                <div className="section-header">
                    <h3><Dna size={20} /> Receptor from PDB</h3>
                    <span className="source-badge">RCSB PDB</span>
                </div>

                <div className="import-input-wrapper">
                    <input
                        type="text"
                        className="import-input"
                        placeholder="Enter PDB ID (e.g., 1A7H)"
                        value={pdbInput}
                        onChange={(e) => setPdbInput(e.target.value.toUpperCase())}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchPDB()}
                        maxLength={4}
                    />
                    <button
                        className="fetch-btn"
                        onClick={handleFetchPDB}
                        disabled={isFetchingPdb || !pdbInput.trim()}
                    >
                        {isFetchingPdb ? (
                            <><Loader2 size={16} className="spin-icon" /> Fetching...</>
                        ) : (
                            <><Download size={16} /> Fetch</>
                        )}
                    </button>
                </div>

                <div className="example-items">
                    <span className="examples-label">Try:</span>
                    {EXAMPLE_PDBS.map((pdb) => (
                        <button
                            key={pdb.id}
                            className="example-btn"
                            onClick={() => setPdbInput(pdb.id)}
                            title={pdb.name}
                        >
                            {pdb.id}
                        </button>
                    ))}
                </div>

                {pdbError && <div className="import-error"><AlertTriangle size={16} /> {pdbError}</div>}

                {pdbResult && (
                    <div className="import-result">
                        <div className="result-header">
                            <span className="success-icon"><CheckCircle size={16} /></span>
                            <span>{pdbResult.title}</span>
                        </div>
                        <button className="action-btn primary" onClick={handleUsePdbAsReceptor}>
                            <Dna size={16} /> Use as Receptor
                        </button>
                    </div>
                )}
            </div>

            {/* PubChem Import Section */}
            <div className="import-section">
                <div className="section-header">
                    <h3><Pill size={20} /> Ligand from PubChem</h3>
                    <span className="source-badge">PubChem</span>
                </div>

                <div className="import-input-wrapper">
                    <input
                        type="text"
                        className="import-input"
                        placeholder="Enter CID or compound name (e.g., 2244 or aspirin)"
                        value={pubchemInput}
                        onChange={(e) => setPubchemInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchPubChem()}
                    />
                    <button
                        className="fetch-btn"
                        onClick={handleFetchPubChem}
                        disabled={isFetchingPubchem || !pubchemInput.trim()}
                    >
                        {isFetchingPubchem ? (
                            <><Loader2 size={16} className="spin-icon" /> Fetching...</>
                        ) : (
                            <><Download size={16} /> Fetch</>
                        )}
                    </button>
                </div>

                <div className="example-items">
                    <span className="examples-label">Try:</span>
                    {EXAMPLE_COMPOUNDS.map((cmp) => (
                        <button
                            key={cmp.query}
                            className="example-btn"
                            onClick={() => setPubchemInput(cmp.query)}
                            title={`CID: ${cmp.query}`}
                        >
                            {cmp.name}
                        </button>
                    ))}
                </div>

                {pubchemError && <div className="import-error"><AlertTriangle size={16} /> {pubchemError}</div>}

                {pubchemResult && (
                    <div className="import-result pubchem-result">
                        <div className="result-header">
                            <span className="success-icon"><CheckCircle size={16} /></span>
                            <span>{pubchemResult.name}</span>
                        </div>

                        {/* ADME Properties Display */}
                        {pubchemResult.properties && (
                            <div className="adme-properties">
                                <h4>📊 Compound Properties</h4>
                                <div className="properties-grid">
                                    {pubchemResult.properties.formula && (
                                        <div className="prop-item">
                                            <span className="prop-label">Formula</span>
                                            <span className="prop-value">{pubchemResult.properties.formula}</span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.molecularWeight && typeof pubchemResult.properties.molecularWeight === 'number' && (
                                        <div className="prop-item">
                                            <span className="prop-label">MW</span>
                                            <span className="prop-value">{pubchemResult.properties.molecularWeight.toFixed(2)} g/mol</span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.adme?.xLogP !== undefined && (
                                        <div className="prop-item">
                                            <span className="prop-label">XLogP</span>
                                            <span className={`prop-value ${pubchemResult.properties.adme.xLogP <= 5 ? 'good' : 'warning'}`}>
                                                {pubchemResult.properties.adme.xLogP.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.adme?.tpsa !== undefined && (
                                        <div className="prop-item">
                                            <span className="prop-label">TPSA</span>
                                            <span className={`prop-value ${pubchemResult.properties.adme.tpsa <= 140 ? 'good' : 'warning'}`}>
                                                {pubchemResult.properties.adme.tpsa.toFixed(1)} Å²
                                            </span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.adme?.hBondDonors !== undefined && (
                                        <div className="prop-item">
                                            <span className="prop-label">H-Donors</span>
                                            <span className={`prop-value ${pubchemResult.properties.adme.hBondDonors <= 5 ? 'good' : 'warning'}`}>
                                                {pubchemResult.properties.adme.hBondDonors}
                                            </span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.adme?.hBondAcceptors !== undefined && (
                                        <div className="prop-item">
                                            <span className="prop-label">H-Acceptors</span>
                                            <span className={`prop-value ${pubchemResult.properties.adme.hBondAcceptors <= 10 ? 'good' : 'warning'}`}>
                                                {pubchemResult.properties.adme.hBondAcceptors}
                                            </span>
                                        </div>
                                    )}
                                    {pubchemResult.properties.adme?.rotatableBonds !== undefined && (
                                        <div className="prop-item">
                                            <span className="prop-label">Rot. Bonds</span>
                                            <span className={`prop-value ${pubchemResult.properties.adme.rotatableBonds <= 10 ? 'good' : 'warning'}`}>
                                                {pubchemResult.properties.adme.rotatableBonds}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Lipinski Rule of 5 Check */}
                                {pubchemResult.properties.adme && pubchemResult.properties.molecularWeight && (
                                    <div className={`lipinski-badge ${(pubchemResult.properties.molecularWeight <= 500) &&
                                        (pubchemResult.properties.adme.xLogP === undefined || pubchemResult.properties.adme.xLogP <= 5) &&
                                        (pubchemResult.properties.adme.hBondDonors === undefined || pubchemResult.properties.adme.hBondDonors <= 5) &&
                                        (pubchemResult.properties.adme.hBondAcceptors === undefined || pubchemResult.properties.adme.hBondAcceptors <= 10)
                                        ? 'pass' : 'fail'
                                        }`}>
                                        {(pubchemResult.properties.molecularWeight <= 500) &&
                                            (pubchemResult.properties.adme.xLogP === undefined || pubchemResult.properties.adme.xLogP <= 5) &&
                                            (pubchemResult.properties.adme.hBondDonors === undefined || pubchemResult.properties.adme.hBondDonors <= 5) &&
                                            (pubchemResult.properties.adme.hBondAcceptors === undefined || pubchemResult.properties.adme.hBondAcceptors <= 10)
                                            ? '✓ Lipinski Rule of 5 Compliant' : '⚠ Lipinski Rule of 5 Violation'}
                                    </div>
                                )}
                            </div>
                        )}

                        <button className="action-btn primary" onClick={handleUsePubchemAsLigand}>
                            <Target size={16} /> PROCEED TO DOCKING ⚡
                        </button>
                    </div>
                )}
            </div>

            {/* SMILES Input Section */}
            <div className="import-section">
                <div className="section-header">
                    <h3><FileText size={20} /> SMILES to 3D</h3>
                    <span className="source-badge">RDKit</span>
                </div>

                <div className="smiles-input-wrapper">
                    <input
                        type="text"
                        className="smiles-input"
                        placeholder="Enter SMILES string (e.g., CCO for ethanol)"
                        value={smilesInput}
                        onChange={(e) => setSmilesInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleProcessSMILES()}
                    />
                    <button
                        className="process-btn"
                        onClick={handleProcessSMILES}
                        disabled={isProcessing || !smilesInput.trim()}
                    >
                        {isProcessing ? (
                            <><Loader2 size={16} className="spin-icon" /> Processing...</>
                        ) : (
                            <><Search size={16} /> Process</>
                        )}
                    </button>
                </div>

                <div className="example-items">
                    <span className="examples-label">Try:</span>
                    {EXAMPLE_MOLECULES.map((mol) => (
                        <button
                            key={mol.name}
                            className="example-btn"
                            onClick={() => setSmilesInput(mol.smiles)}
                        >
                            {mol.name}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="prep-error"><span><AlertTriangle size={16} /></span> {error}</div>}

            {/* SMILES Results Section */}
            {(svgDepiction || properties) && (
                <div className="results-section">
                    <div className="results-grid">
                        {svgDepiction && (
                            <div className="depiction-card">
                                <h3>2D Structure</h3>
                                <div
                                    className="svg-container"
                                    dangerouslySetInnerHTML={{ __html: svgDepiction }}
                                />
                                {processedData?.canonicalSmiles && (
                                    <div className="canonical-smiles">
                                        <span className="label">Canonical:</span>
                                        <code>{processedData.canonicalSmiles}</code>
                                    </div>
                                )}
                            </div>
                        )}

                        {processedData?.pdbBlock && (
                            <div className="actions-card">
                                <h3>Actions</h3>
                                <button className="action-btn primary" onClick={handleUseAsLigand}>
                                    <Target size={16} /> Use as Ligand
                                </button>
                                <button
                                    className="action-btn secondary"
                                    onClick={() => {
                                        const blob = new Blob([processedData.pdbBlock!], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'molecule.pdb';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                >
                                    <Download size={16} /> Download PDB
                                </button>
                            </div>
                        )}
                    </div>

                    {properties && <MolecularPropertiesDisplay properties={properties} />}
                </div>
            )}

            {/* Format Conversion Section */}
            <div className="conversion-section active">
                <div className="section-header">
                    <h3><RefreshCw size={20} /> Format Conversion</h3>
                    <span className="format-badge">PDB → PDBQT</span>
                </div>

                <div className="conversion-content">
                    <div className="file-select-row">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept=".pdb,.sdf,.mol,.mol2,.xyz"
                            style={{ display: 'none' }}
                        />
                        <button
                            className="file-select-btn"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FolderOpen size={16} /> Select File
                        </button>
                        {conversionFile && (
                            <span className="file-name">{conversionFile.name}</span>
                        )}
                    </div>

                    <div className="format-selectors">
                        <div className="format-select">
                            <label>From:</label>
                            <select
                                value={inputFormat}
                                onChange={(e) => setInputFormat(e.target.value as SupportedInputFormat)}
                            >
                                {INPUT_FORMATS.map((fmt) => (
                                    <option key={fmt.extension} value={fmt.extension}>
                                        {fmt.name} (.{fmt.extension})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <span className="arrow"><ArrowRight size={20} /></span>

                        <div className="format-select">
                            <label>To:</label>
                            <select
                                value={outputFormat}
                                onChange={(e) => setOutputFormat(e.target.value as SupportedOutputFormat)}
                            >
                                {OUTPUT_FORMATS.map((fmt) => (
                                    <option key={fmt.extension} value={fmt.extension}>
                                        {fmt.name} (.{fmt.extension})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        className="convert-btn"
                        onClick={handleConvert}
                        disabled={isConverting || !conversionFileContent}
                    >
                        {isConverting ? (
                            <><Loader2 size={16} className="spin-icon" /> Converting...</>
                        ) : (
                            <><Zap size={16} /> Convert</>
                        )}
                    </button>

                    {conversionError && (
                        <div className="conversion-error"><AlertTriangle size={16} /> {conversionError}</div>
                    )}

                    {conversionResult && (
                        <div className="conversion-result">
                            <div className="result-header">
                                <span className="success-icon"><CheckCircle size={16} /></span>
                                <span>Conversion successful!</span>
                            </div>
                            <div className="result-actions">
                                <button className="action-btn primary" onClick={handleUseConvertedAsLigand}>
                                    <Target size={16} /> Use as Ligand
                                </button>
                                <button className="action-btn secondary" onClick={handleUseConvertedAsReceptor}>
                                    <Dna size={16} /> Use as Receptor
                                </button>
                                <button className="action-btn secondary" onClick={handleDownloadConverted}>
                                    <Download size={16} /> Download
                                </button>
                            </div>
                            <div className="result-preview">
                                <pre>{conversionResult.substring(0, 500)}...</pre>
                            </div>
                        </div>

                    )}
                </div>
            </div>
        </div>
    );
}
