# Pod Agent

育种Agent，目前面向大豆，仍可拓展

lian@lab

# 快速开始

```
git clone https://github.com/Linmoqian/pod-agent
cd app & pnpm install
pnpm run tauri dev
```

# docs说明

# 目录说明

app 为主要Agent开发
3D-app 为点云测试，实验功能
sensor-app 为传感器的代码，采用CPP手写，可忽略
hardware 为硬件设计部分，可忽略
website 为本Agent的宣传网页，可忽略
tests为测调试脚本，功能的简单实现，是最小原理的示范，但实际是用更高层的抽象和组合，仅供学习

# 开发手册

请人类开发者查看如何开发，如何调试，如何测试，并如何贡献此仓库 @docs/contributing.md
