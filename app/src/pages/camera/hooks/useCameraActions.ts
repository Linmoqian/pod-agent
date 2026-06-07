import { useCameraStore } from "../../../store";

export function useCameraActions() {
  const handleYoloToggle = async () => {
    const { yoloLoaded, loadYoloModel, toggleDetection } = useCameraStore.getState();
    if (!yoloLoaded) {
      await loadYoloModel();
    }
    if (useCameraStore.getState().yoloLoaded) {
      toggleDetection();
    }
  };

  return { handleYoloToggle };
}
