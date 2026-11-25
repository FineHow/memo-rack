Local image processing resources

MODNet portrait matting: ZHKKKe/MODNet, Apache-2.0.
ONNX conversion: Xenova/modnet, revision 7aaa8a27c987ae9452a60443a7afeb6b2a52843a.
Model SHA256: 07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9
https://github.com/ZHKKKe/MODNet
https://huggingface.co/Xenova/modnet
Apache license is included in MODNet-LICENSE.

ONNX Runtime Web 1.24.3, Microsoft Corporation, MIT.
https://github.com/microsoft/onnxruntime
https://onnxruntime.ai/docs/tutorials/web/
MIT license is included in onnxruntime-LICENSE.

Inference runs in a cancellable browser worker using local WebAssembly.
Photos are never sent to a model server. The distributed model and runtime
are sufficient for offline operation; Python and a model cache are not needed.
The portrait model may need manual edge repair; group photos require the
user to select and confirm the desired person before background removal.
