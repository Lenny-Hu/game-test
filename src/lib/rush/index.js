import Phaser from "phaser";
import gameScene from "./game-scene";

class Game {
  constructor(config = {}) {
    // 游戏界面缩放设置：最大宽度为设计图的宽，高度按缩放zoom来算，不超过窗口高度，不大于设计图高度
    this.desWidth = 640;
    this.desHeight = 1600;
    this.zoom =
      window.innerWidth / this.desWidth > 1
        ? 1
        : window.innerWidth / this.desWidth;
    this.gameWidth = this.desWidth;
    this.gameHeight =
      (window.innerHeight > this.desHeight
        ? this.desHeight
        : window.innerHeight) / this.zoom;

    this.game = null;
    this.platforms = null;
    this.player = null;
    this.cursors = null;
    this.stars = null;
    this.score = 0;
    this.scoreText = "";

    this.options = {
      baseURL: location.protocol + "//" + location.host,
      config: {
        pixelArt: true,
        backgroundColor: "0xffffff",
        type: Phaser.AUTO,
        width: this.gameWidth,
        height: this.gameHeight,
        zoom: this.zoom,
        physics: {
          default: 'arcade',
          arcade: {
            // gravity: { y: 200 },
            debug: true
          }
        },
        // physics: {
        //   default: "arcade",
        //   arcade: {
        //     gravity: { y: 300 },
        //     debug: false,
        //   },
        // },
        scene: gameScene(this),
      },
      assets: [
        // 1: 普通图片，2: 精灵图
        {
          name: "game-bg",
          type: 1,
          src: require("../../assets/rush/game-bg.png"),
        },
        {
          name: "game-bg2",
          type: 1,
          src: require("../../assets/rush/game-bg2.png"),
        },
        {
          name: "game-start",
          type: 1,
          src: require("../../assets/rush/game-start.png"),
        },
        {
          name: "game-tt",
          type: 1,
          src: require("../../assets/rush/game-tt.png"),
        },
        {
          name: "cactus",
          type: 1,
          src: require("../../assets/rush/cactus.png"),
        },
        {
          name: "gold",
          type: 1,
          src: require("../../assets/rush/gold.png"),
        },
        {
          name: "rock",
          type: 1,
          src: require("../../assets/rush/rock.png"),
        },
        {
          name: "wood1",
          type: 1,
          src: require("../../assets/rush/wood-1.png"),
        },
        {
          name: "wood2",
          type: 1,
          src: require("../../assets/rush/wood-2.png"),
        },
        {
          name: "people1",
          type: 1,
          src: require("../../assets/rush/people-1.png"),
        },
        {
          name: "people2",
          type: 1,
          src: require("../../assets/rush/people-2.png"),
        },
        {
          name: "people3",
          type: 1,
          src: require("../../assets/rush/people-3.png"),
        },
        {
          name: "people",
          type: 2,
          src: require("../../assets/rush/people.png"),
          options: {
            frameWidth: 250,
            frameHeight: 360
          }
        },
        {
          name: "brawler",
          type: 2,
          src: require("../../assets/rush/brawler48x48.png"),
          options: {
            frameWidth: 48,
            frameHeight: 48
          }
        }
      ],
    };
    this.options.config = Object.assign(this.options.config, config);
  }

  preload() {
    console.log("加载资源...", this.$game.options);
    this.load.setBaseURL(this.$game.options.baseURL);

    this.$game.options.assets.forEach((v) => {
      switch (v.type) {
        case 1:
          this.load.image(v.name, v.src);
          break;

        case 2:
          this.load.spritesheet(v.name, v.src, v.options);
          break;

        default:
          break;
      }
    });
  }

  create() {
    console.log("create", this);
    // 背景
    let gameBg = this.add.image(
      this.$game.gameWidth / 2,
      this.$game.desHeight / 2,
      "game-bg"
    );
    // let gameBg = this.add.image(0, 0, 'game-bg');
    // Phaser.Display.Align.In.Center(gameBg, this.add.zone(_this.gameWidth / 2, _this.desHeight / 2, _this.gameWidth, _this.gameHeight));

    // 顶部标题文字
    let gameTt = this.add
      .image(this.$game.gameWidth / 2, 0, "game-tt")
      .setAlpha(0);

    // 开始按钮
    let gameStart = new Phaser.GameObjects.Image(this, 0, 0, "game-start");
    gameBg.setInteractive();
    gameBg.on(
      "click",
      this.$game.startGame,
      this
    );

    // 人数文本
    let countText = new Phaser.GameObjects.Text(
      this,
      -this.$game.gameWidth / 2,
      80,
      "已有1789人参与游戏",
      {
        fontSize: "36px",
        fill: "#fff",
        align: "center",
        fixedWidth: this.$game.gameWidth,
      }
    );

    let btBox = this.add.container(0, 0, [gameStart, countText]).setAlpha(0);
    Phaser.Display.Align.In.BottomCenter(btBox, gameBg);
    console.log(btBox, gameBg);

    this.tweens.add({
      targets: [gameTt],
      alpha: 1,
      y: "+=225",
      duration: 1000,
      ease: "Power3",
    });

    this.tweens.add({
      targets: [btBox],
      alpha: 1,
      y: this.$game.gameHeight - 280,
      duration: 1000,
      ease: "Power3",
    });

    this.input.on(
      "gameobjectup",
      function(pointer, gameObject) {
        gameObject.emit("click", gameObject);
      },
      this
    );
  }

  update() {
    // console.log('update');
  }

  startGame() {
    console.log("点击了");
    this.scene.start("game");
  }

  init() {
    this.game = new Phaser.Game(this.options.config);
    console.log(this.game);
  }
}

export default Game;
