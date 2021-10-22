import Hilo from 'hilojs';
import Asset from './asset'
import Zongzi from './zongzi'
import Hand from './hand'
import bus from './bus';

export default class game {
  constructor(page) {
    this.page = page
    //设置的游戏时间
    this.setGameTime = 30
    this.gameTime = 0
    this.gameStatus = "ready"
    /*
      play 游戏开始
      ready 游戏结束
    **/
    // 下载队列
    this.asset = new Asset()

    // 画布对象
    this.stage = null

    // test
    // this.gameWidth = 640;
    // this.gameHeight = 1136; // 1600
    // this.stageScaleX = innerWidth / this.gameWidth;
    // this.stageScaleY = innerHeight / this.gameHeight;

    // 画布信息 
    this.width = innerWidth * 2
    // this.height = innerHeight * 2 < 1334 ? innerHeight * 2 : 1334
    this.height = innerHeight * 2
    this.scale = 0.5

    // 定时器对象
    this.ticker = null

    //粽子对象
    this.Zongzi = null
    //粽子下落速度
    this.enemySpeed = 700
    //粽子生成速度
    this.createSpeed = 400
    //接粽子的手
    this.hand = null
    //开始按钮
    this.beginBtn = null
    this.titleText = null
    this.mainBg = null;
    //分数
    this.score = 0
  }
  init() {
    this.asset.on('complete', function () {
      this.asset.off('complete')
      this.initStage()
    }.bind(this));
    this.asset.load()
  }
  addMainBg(bgImg) {
    if (this.mainBg) {
      this.stage.removeChild(this.mainBg);
    }

    this.mainBg = new Hilo.Bitmap({
      id: 'bg',
      image: bgImg,
      scaleX: this.width / bgImg.width,
      scaleY: this.width / bgImg.width // 等比例放大，以宽为准
    }).addTo(this.stage, 0);
  }
  initStage() {
    // 舞台
    this.stage = new Hilo.Stage({
      renderType: 'canvas',
      width: this.width,
      height: this.height,
      scaleX: this.scale,
      scaleY: this.scale,
      // width: this.gameWidth,
      // height: this.gameHeight,
      // scaleX: this.stageScaleX,
      // scaleY: this.stageScaleX,
      container: this.page
    });
    this.stage.enableDOMEvent([Hilo.event.POINTER_START, Hilo.event.POINTER_MOVE, Hilo.event.POINTER_END]);

    // 启动定时器刷新页面 参数为帧率
    this.ticker = new Hilo.Ticker(60)
    // 舞台添加到定时队列中
    this.ticker.addTick(this.stage)
    // 添加动画类到定时队列
    this.ticker.addTick(Hilo.Tween);
    //启动ticker
    this.ticker.start(true);

    this.initBg();

    this.initBeginBtn();

    this.initText();

    //this.initZongzi();
    //this.initHand();
  }
  initText() {
    this.titleText = new Hilo.Bitmap({
      id: 'txt',
      image: this.asset.txt,
      alpha: 0,
      x: (this.width - this.asset.txt.width) / 2,
      // scaleX: this.width / txtImg.width,
      // scaleY: this.width / bgImg.width // 等比例放大，以宽为准
    }).addTo(this.stage);

    Hilo.Tween.to(this.titleText, {
      y: 60,
      alpha: 1,
    }, {
      duration: 600,
      ease: Hilo.Ease.Quad.EaseIn
    });

    // console.log(Hilo.event);
    // this.titleText.on(Hilo.event.POINTER_MOVE, function (e) {
    //   console.log('点击字体', e);
    // })
  }
  initBg() {  //初始化背景
    this.addMainBg(this.asset.bg);
  }
  initBeginBtn() { //初始化开始按钮
    this.beginBtn = new Hilo.Bitmap({
      id: 'beginBtn',
      alpha: 0,
      image: this.asset.beginBtn,
      x: (this.width - this.asset.beginBtn.width) / 2,
      y: this.height - this.asset.beginBtn.height - 200,
      rect: [0, 0, this.asset.beginBtn.width, this.asset.beginBtn.height]
    }).addTo(this.stage, 1);
    
    this.beginBtn.on(Hilo.event.POINTER_START, this.startGame.bind(this))

    Hilo.Tween.to(this.beginBtn, {
      alpha: 1,
    }, {
      duration: 400,
      ease: Hilo.Ease.Quad.EaseIn
    });

  }
  startGame() {   //开始游戏
    this.gameTime = this.setGameTime;
    this.score = 0;
    this.gameStatus = "play"

    this.addMainBg(this.asset.bg2);

    this.initZongzi();
    this.initHand()
    //this.beginBtn.removeFromParent()
    this.stage.removeChild(this.beginBtn)

    // 标题飞出
    Hilo.Tween.to(this.titleText, {
      y: -this.asset.txt.height,
      alpha: 0,
    }, {
      duration: 500,
      ease: Hilo.Ease.Quad.EaseOut
    });

    
    this.calcTime()
  }
  calcTime() { //游戏时间
    bus.fire('gameTimeUpdate', {gameTime: this.gameTime});

    setTimeout(() => {
      if (this.gameTime > 0) {
        this.gameTime--;
        this.calcTime()
      } else {
        this.gameOver()
      }

      bus.fire('gameTimeUpdate', {gameTime: this.gameTime});
    }, 1000);
  }
  gameOver() {//游戏结束
    this.Zongzi.stopCreateEnemy()
    this.gameStatus = "ready"
    this.initBeginBtn()
    //this.hand.removeChild(this.hand.score)
    this.stage.removeChild(this.hand)
    this.addMainBg(this.asset.bg);
  }
  initZongzi() {//初始化粽子
    this.Zongzi = new Zongzi({
      id: 'Zongzi',
      height: this.height,
      width: this.width,
      enemySpeed: this.enemySpeed,
      createSpeed: this.createSpeed,
      pointerEnabled: false, // 不关闭事件绑定 无法操作舞台
      zongziList: [this.asset.bigzZongzi, this.asset.zongzi, this.asset.zongzi3, this.asset.fruit],
      gameTime: this.gameTime
    }).addTo(this.stage, 2)
    //舞台更新
    this.stage.onUpdate = this.onUpdate.bind(this);
  }
  initHand() {//初始化手
    this.hand = new Hand({
      id: 'hand',
      img: this.asset.hand,
      height: this.asset.hand.height,
      width: this.asset.hand.width,
      x: this.width / 2 - this.asset.hand.width / 2,
      y: this.height - this.asset.hand.height + 30
    }).addTo(this.stage, 1);
    Hilo.util.copy(this.hand, Hilo.drag);
    this.hand.startDrag([-this.asset.hand.width / 4, this.height - this.asset.hand.height + 30, this.width - this.asset.hand.width / 2, 0]);
  }
  onUpdate() {//舞台更新
    if (this.gameStatus == 'ready') {
      return
    }
    this.Zongzi.children.forEach(item => {
      if (this.hand.checkCollision(item)) {
        // 碰撞了
        item.over();

        if (this.score + item.score <= 0) {
          this.score = 0;
        } else {
          this.score += item.score;
        }

        this.hand.addScore(item.score) 
      }
    })
  }
}