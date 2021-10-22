import Phaser from "phaser";

class Game {
  constructor(config = {}) {
    let _this = this;
    // 游戏界面缩放设置：最大宽度为设计图的宽，高度按缩放zoom来算，不超过窗口高度，不大于设计图高度
    this.desWidth = 640;
    this.desHeight = 1600;
    this.zoom = window.innerWidth / this.desWidth > 1 ? 1 : window.innerWidth / this.desWidth;
    this.gameWidth = this.desWidth;
    this.gameHeight = (window.innerHeight >  this.desHeight ? this.desHeight : window.innerHeight) / this.zoom;

    this.game = null;
    this.platforms = null;
    this.player = null;
    this.cursors = null;
    this.stars = null;
    this.score = 0;
    this.scoreText = '';

    this.options = {
      baseURL: location.protocol + '//' + location.host,
      config: {
        backgroundColor: '0xffffff',
        type: Phaser.AUTO,
        width: this.gameWidth,
        height: this.gameHeight,
        zoom: this.zoom,
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { y: 300 },
            debug: false
          }
        },
        scene: {
          preload () {
            _this.preload.bind(this, _this)(); 
          },
          create () {
            _this.create.bind(this, _this)(); 
          },
          update () {
            _this.update.bind(this, _this)(); 
          }
        }
      },
      assets: [ // 1: 普通图片，2: 精灵图
        {
          name: 'game-bg',
          type: 1,
          src: require('../../assets/rush/game-bg.png')
        },
        {
          name: 'game-bg2',
          type: 1,
          src: require('../../assets/rush/game-bg2.png')
        },
        {
          name: 'game-start',
          type: 1,
          src: require('../../assets/rush/game-start.png')
        },
        {
          name: 'game-tt',
          type: 1,
          src: require('../../assets/rush/game-tt.png')
        }
      ]
    };
    this.options.config = Object.assign(this.options.config, config);
  }

  preload(_this) {
    console.log('加载资源...', _this);
    this.load.setBaseURL(_this.options.baseURL);

    _this.options.assets.forEach(v => {
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

  create(_this) {
    console.log('create', _this);
    // 背景
    this.add.image(_this.gameWidth / 2, _this.desHeight / 2, 'game-bg');
    // 顶部标题文字
    let gameTt = this.add.image(_this.gameWidth / 2, 155 + 70, 'game-tt').setAlpha(0);
    // 开始按钮
    let gameStart = this.add.image(_this.gameWidth / 2, _this.gameHeight - 280, 'game-start').setAlpha(0);
    // 人数文本
    this.add.text(0, _this.gameHeight - 220, '已有1789人参与游戏', { fontSize: '32px', fill: '#fff' });

    this.tweens.add({
      targets: [gameTt, gameStart],
      // x: 700,
      alpha: 1, // 透明度
      duration: 1000,
      // ease: 'Sine.easeInOut',
      // yoyo: true,
      // delay: 1000
    });
    // var particles = this.add.particles('red');

    // var emitter = particles.createEmitter({
    //     speed: 100,
    //     scale: { start: 1, end: 0 },
    //     blendMode: 'ADD'
    // });

    // var logo = this.physics.add.image(0, 0, 'game-tt');

    // logo.setVelocity(100, 200);
    // logo.setBounce(1, 1);
    // logo.setCollideWorldBounds(true);

    // emitter.startFollow(logo);
  }

  update() {
    console.log('update');
  }

  init() {
    this.game = new Phaser.Game(this.options.config);
    console.log(this.game);
  }
}

export default Game
