# 刘浩炫 · AERO GLASS / FLIGHT LAB

飞行器制造工程 × AI 个人作品集。直接使用 HTML、CSS、JavaScript，所有图片、字体与图标均可本地加载。无需安装 Node.js、npm 或构建工具。

## 本地查看

双击 `index.html`，推荐使用新版 Edge、Chrome、Safari 或 Firefox。保持 `index.html` 与 `assets` 文件夹在同一层级。

## 上传 GitHub Pages

1. 解压 `GitHub-Pages-上传包.zip`。
2. 将解压后的 **index.html、完整 assets 文件夹、.nojekyll、README.md** 上传到仓库的根目录，不要直接上传 ZIP 代替网页文件，也不要多包一层文件夹。
3. 进入仓库 **Settings → Pages**。在 **Build and deployment → Source** 选择 **Deploy from a branch**。
4. 选择存放这些文件的分支（例如 `main`）与 **/(root)**，点击 **Save**。
5. 等待 GitHub 部署完成后打开 Pages 显示的网址。若更新后仍看到旧样式，可强制刷新页面。

原目录中的历史 ZIP、备份、预览截图和验收说明都不需要上传。资源使用相对路径，兼容 `用户名.github.io/仓库名/`。

[GitHub 官方部署说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 使用

- 右上角暂停/播放按钮控制气流、航迹、鼠标视差、玻璃光照及环境动画；状态保存到本地。
- 太阳/月亮按钮切换深色与白钛实验室主题；状态保存到本地。
- 系统开启“减少动态效果”时，环境动效保持关闭，所有内容仍完整可见。
- 项目 Tab 可点击，也可使用左右方向键、Home、End 切换。
- 证书支持点击、Enter、空格打开；Esc、关闭按钮或背景关闭，焦点返回原证书。
- 手机通过菜单按钮打开玻璃导航抽屉；核心成果栏可横向滑动。
- 页尾可拨打电话，或复制邮箱、微信、QQ。外部试玩链接继续指向原坦克大战项目。

## 文件与维护

- `index.html`：保留个人介绍、经历、项目、能力、教育和证书内容，添加航空标记及无障碍结构。
- `assets/aviation.css`：深浅色 Design Token、统一玻璃材质、响应式布局、入场与交互动效。
- `assets/aviation.js`：IIFE 内的 PointerController、AirflowCanvas、CounterController、RevealController、NavigationController、ProjectTabs、CertificateViewer、MotionController。
- `assets/icons.css` 与 `Phosphor-Portfolio.woff2`：从原 Phosphor 图标库提取本页使用的 17 个图标。原 `phosphor.css` 与 `Phosphor.woff2` 继续保留，后续新增图标可使用原库。
- `assets/Geist-Latin.woff2`：本地英文字体；中文使用苹方、微软雅黑等系统字体。
- `assets/Geist-OFL.txt` 与 `Phosphor-LICENSE.txt`：字体和图标许可。

所有原图片文件、图片路径和项目链接均已保留。技能区的百分数沿用原站自评数据，线段是原数值的视觉表达。

## 动效与性能

事件只记录鼠标目标位置，统一 `requestAnimationFrame` 进行平滑插值。帧循环中不查找 DOM、不测量布局、不重新创建流线数组或渐变。玻璃仅更新当前悬停元素，高光更新上限约 30 次/秒；卡片最大倾角为 2.5°。

桌面视觉计算限制在约 60 次/秒，Canvas DPR 最高为 2。手机流线降至 8 条、Canvas 约 30 次/秒，关闭鼠标效果、倾斜和视差。页面隐藏时停止调度；暂停不影响按钮、项目切换或证书弹窗。

玻璃是原生网页材质近似实现，不依赖 Apple 私有 API。Canvas、IntersectionObserver、存储或 backdrop-filter 不可用时均有降级。源码保持可读，部署不需要压缩或编译。
