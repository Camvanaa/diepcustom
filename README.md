<br><br>
<div align="center">
<img src="./icon.png" width="20%" />
<h3> diep custom </h3>
<p> An open source diep.io custom private-server template </p>
</div>
<br>

## Installation

You may need to install [Node.js](https://nodejs.org/), as well as the [Yarn Package Manager](https://classic.yarnpkg.com/en/docs/install).\
After doing so, download or clone this repository and install the dependencies with:
```bash
$ yarn install
```

## Running the Server

Run the server with:
```bash
$ yarn run server
```
This builds and runs the server.

After running the server, content will be served at `localhost:PORT` on your computer. The port will default to 8080, and you may override it with `process.env.PORT`.

Consult `src/config.ts` for configuration, and `package.json` for environ variable setup.

## Discord Chat

For support or discussion, please join our [online Discord chat](https://discord.gg/SyxWdxgHnT).

## Contribution

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for information on contributing.

## License

Please see [LICENSE](./LICENSE)

## 开发日志
- 2025-01-12 添加 坦克MegaSmasher, 调整 坦克AutoSmasher.
- 2025-01-12 添加 弹药RocketDrone 坦克Tyrant.
- 2025-01-16 添加 弹药TankPojectile, 测试 坦克Overmind, Shadow.
- 2025-01-21 添加 弹药Split(cell) 坦克Cell.
- 2025-01-23 添加 弹药poison 坦克Viper.
- 2025-01-24 添加 弹药Frozen, Contaminator 坦克Glacier, Plaguebriger.
- 2025-01-26 调整 升级曲线至sqrt函数.
- 2025-01-27 调整 增强大部分tank进攻能力.