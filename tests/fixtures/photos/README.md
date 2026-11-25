这些素材只用于本地功能和边缘质量检查，不是默认搭子，也不表示照片中人物认可本产品。

| 文件 | 检查类型 | 来源与许可 |
| --- | --- | --- |
| astronaut.png | 正面、头部建议框 | NASA Eileen Collins；[scikit-image 数据说明](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut) 标注 public domain；取自 scikit-image v0.24.0 |
| glasses.jpg | 眼镜、灰发 | Grace Hopper 官方肖像，取自 [Matplotlib v3.9.0 sample data](https://github.com/matplotlib/matplotlib/blob/v3.9.0/lib/matplotlib/mpl-data/sample_data/grace_hopper.jpg)，美国海军官方照片，public domain |
| long-hair.jpg | 较长卷发 | NASA Sally Ride 官方肖像 S84-37256；[素材说明](https://commons.wikimedia.org/wiki/File:Sally_Ride_in_1984.jpg)，public domain；下载自 images-assets.nasa.gov/image/S84-37256/S84-37256~orig.jpg |
| side-complex.jpg | 侧脸、复杂驾驶舱背景 | NASA Sally Ride on Flight Deck S83-35783；下载自 [NASA 素材](https://images-assets.nasa.gov/image/S83-35783/S83-35783~medium.jpg)，NASA 官方图片 |
| multi-person.png | 明确框选其中一人 | 将 astronaut.png 与 glasses.jpg 并排拼成的双人测试图，合成操作仅为测试目标选择，不冒充真实合照 |
| transparent.png | 已有透明 PNG | 项目已有 public/brand/rice.png 的测试副本；只验证透明通道，不用于评价真人头发边缘 |

复杂背景复用 side-complex.jpg，因此 6 个文件覆盖 7 类输入。模型是人像抠图模型，多人图必须先明确框选；自动去背景不会承诺识别用户想保留的具体人物。细发、眼镜反光、遮挡等边缘应结合大图和手动擦除/恢复检查。

补充：`head-cutout.png` 是 astronaut.png 经本地 MODNet 和实际编辑器头部裁剪得到的派生 QA 素材，用于八款身体与原生成员布局检查。`exif/` 下是自行生成的四色几何 JPEG/PNG 测试图，覆盖八种 EXIF 方向，无第三方人物。
