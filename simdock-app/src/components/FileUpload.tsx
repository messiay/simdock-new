/**
 * File Upload Component
 * Drag & drop / file picker for molecular structure files
 */

import { useCallback, useState } from 'react';

interface FileUploadProps {
    label: string;
    accept: string;
    onFileLoaded: (content: string, filename: string) => void;
}

export function FileUpload({ label, accept, onFileLoaded }: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [filename, setFilename] = useState<string | null>(null);

    const handleFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            setFilename(file.name);
            onFileLoaded(content, file.name);
        };
        reader.readAsText(file);
    }, [onFileLoaded]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    }, [handleFile]);

    return (
        <div
            className={`file-upload ${isDragging ? 'dragging' : ''} ${filename ? 'has-file' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            <input
                type="file"
                accept={accept}
                onChange={handleInputChange}
                id={`file-${label}`}
                hidden
            />
            <label htmlFor={`file-${label}`}>
                {filename ? (
                    <>
                        <span className="file-icon">📄</span>
                        <span className="file-name">{filename}</span>
                    </>
                ) : (
                    <>
                        <span className="upload-icon">📁</span>
                        <span className="upload-text">{label}</span>
                        <span className="upload-hint">Drag & drop or click</span>
                    </>
                )}
            </label>
        </div>
    );
}

export default FileUpload;
