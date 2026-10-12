let transcriber;
let currentModel;

self.onmessage = async ({data}) => {
  if (data.type !== 'transcribe') return;
  try {
    // Loaded only on user request, not on page load. Fixed library version for reproducibility.
    const {pipeline, env} = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
    env.allowLocalModels = false;
    env.backends.onnx.wasm.numThreads = 1;
    if (currentModel !== data.model || !transcriber) {
      if (transcriber) await transcriber.dispose();
      transcriber = null;
      currentModel = data.model;
      transcriber = await pipeline('automatic-speech-recognition', data.model, {
        quantized: true,
        progress_callback: progress => self.postMessage({type: 'model-progress', file: progress.file, status: progress.status, progress: progress.progress}),
      });
    }
    self.postMessage({type: 'recognizing'});
    const options = {task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5};
    if (data.language !== 'auto') options.language = data.language;
    const result = await transcriber(data.audio, options);
    self.postMessage({type: 'complete', result});
  } catch (error) {
    self.postMessage({type: 'error', message: error.message || String(error)});
  }
};
