import { useCallback, useState } from 'react';

interface FileUploadProps {
  onFileLoaded: (data: Uint8Array, fileName: string) => void;
}

export function FileUpload({ onFileLoaded }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        onFileLoaded(data, file.name);
      };
      reader.readAsArrayBuffer(file);
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-2xl p-12 text-center
        transition-all duration-300 cursor-pointer
        ${
          isDragging
            ? 'border-indigo-400 bg-indigo-500/10 scale-[1.02]'
            : 'border-slate-600 hover:border-indigo-500/50 hover:bg-slate-800/50'
        }
      `}
    >
      <input
        type="file"
        accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp"
        onChange={handleInputChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div className="flex flex-col items-center gap-4">
        <div className={`
          w-16 h-16 rounded-full flex items-center justify-center
          transition-all duration-300
          ${isDragging ? 'bg-indigo-500/20' : 'bg-slate-700'}
        `}>
          <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
          </svg>
        </div>
        {fileName ? (
          <div>
            <p className="text-lg font-medium text-slate-200">{fileName}</p>
            <p className="text-sm text-slate-400 mt-1">Drop another file to replace</p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium text-slate-200">
              Drop a Guitar Pro file here
            </p>
            <p className="text-sm text-slate-400 mt-1">
              or click to browse — supports .gp, .gp3, .gp4, .gp5, .gpx
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
