import { useCameraStore } from "../../store";

interface CaptureButtonProps {
  onClick: () => void;
}

export default function CaptureButton({ onClick }: CaptureButtonProps) {
  const { mode, isRecording } = useCameraStore();

  return (
    <button
      onClick={onClick}
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-white transition-transform active:scale-95"
    >
      {mode === "video" ? (
        isRecording ? (
          <div className="h-5 w-5 rounded-sm bg-red-500" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-red-500" />
        )
      ) : (
        <div className="h-12 w-12 rounded-full bg-white" />
      )}
    </button>
  );
}
