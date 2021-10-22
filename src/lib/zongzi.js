import Hilo from "hilojs";
import SmallZongzi from "./small-zongzi";
import bus from "./bus";

let Enemy = Hilo.Class.create({
  Extends: Hilo.Container,
  Mixes: Hilo.EventMixin,
  SmallZongziImg: null,
  timer: null, // 定时器
  zongziList: [],
  enemySpeed: 0,
  createSpeed: 0,
  score: [2, 2, 1, -5],
  tween: null,
  gameTime: 0,
  constructor: function (properties) {
    console.log('gameTime', properties.gameTime);
    Enemy.superclass.constructor.call(this, properties);
    this._gameTime = properties.gameTime;

    //this.onUpdate = this.onUpdate.bind(this);
    //this.createSmallZongzi()
    this.tween = Hilo.Tween;
    this.creatEnemy();
    this.beginCreateEnemy();
    this.addListener();
  },
  addListener () {
    let _this = this;
    bus.off('gameTimeUpdate');
    bus.on('gameTimeUpdate', function (data) {
      _this.gameTime = data.detail.gameTime;
    });
  },
  random(lower, upper) {
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
  },
  creatEnemy() {
    // 生成粽子
    let number = this.random(0, 100);
    let index = null;
    let arr = [27, 37, 55, 100]; // 对应

    // 生成粽子、香蕉皮的概率
    for (let _i = 0; _i < arr.length; _i++) {
      if (number < arr[_i]) {
        index = _i;
        break;
      }
    }

    let hold = new SmallZongzi({
      image: this.zongziList[index],
      rect: [0, 0, this.zongziList[index].width, this.zongziList[index].height],
    }).addTo(this);

    hold.x = this.random(100, this.width - 100);

    hold.y = -300 * Math.random();

    hold.score = this.score[index];

    let n = this.gameTime / this._gameTime; // 下落加速
    if (n < 0.6) { // 最多加速一半
      n = 0.6;
    }
    this.tween.to(
      hold,
      {
        y: this.height + 200,
      },
      {
        duration: (1400 / this.enemySpeed * n) * 1000,
        loop: false,
        onComplete: () => {
          hold.removeFromParent();
        },
      }
    );
  },
  beginCreateEnemy() {
    //开始生成
    this.timer = setInterval(() => {
      this.creatEnemy();
    }, this.createSpeed);
  },
  stopCreateEnemy() {
    //停止生成并全部移除
    clearInterval(this.timer);
    this.removeAllChildren();
  },
  checkCollision(enemy) {
    //碰撞检测
    for (var i = 0, len = this.children.length; i < len; i++) {
      if (enemy.hitTestObject(this.children[i], true)) {
        return true;
      }
    }
    return false;
  },
});

export default Enemy;
