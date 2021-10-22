import Hilo from 'hilojs';

let hand = Hilo.Class.create({
  Extends: Hilo.Container,

  // 图
  img: null,
  //碗
  bowl: null,
  //分数
  score: null,

  constructor(properties) {
      hand.superclass.constructor.call(this, properties)
      this.initHand()
      this.initBowl()
  },
  initHand() {  //初始化背景
      new Hilo.Bitmap({
          id: 'hand',
          image: this.img,
          rect: [0, 0, this.img.width, this.img.height]
      }).addTo(this);
  },
  initBowl() { //初始化碗
      this.bowl = new Hilo.Bitmap({
          id: 'bowl',
          //background: 'rgba(255,255,255,0.4)',
          rect: [0, 0, this.img.width / 3, 10],
          x: this.img.width / 3,
          y: 50
      }).addTo(this);
  },
  addScore(text) { //加分
    //   this.score = new Hilo.Bitmap({
    //       id: 'score',
    //       image: image,
    //       rect: [0, 0, image.width, image.height],
    //       x: (this.img.width - image.width) / 2,
    //       y: -image.height
    //   }).addTo(this);

      this.score = new Hilo.Text({
        id: 'score',
        text: text > 0 ? '+' + text : text,
        color: text < 0 ? '#ff0000' : '#00ffff',
        font: '60px arial',
        // rect: [0, 0, text.width, text.height],
        x: (this.img.width - 40) / 2,
        y: -60
    }).addTo(this);

      Hilo.Tween.to(this.score, {
          y: -100,
        //   x: 100,
        //   x: (this.img.width - image.width / 2) / 2,
        //   y: -2 * image.height,
          alpha: 0,
        //   width: image.width / 2,
        //   height: image.height / 2
      }, {
          duration: 600,
          //delay: 100,
          ease: Hilo.Ease.Quad.EaseIn,
          onComplete: () => {
              
          }
      });
  },

  // 碰撞检测
  checkCollision(enemy) {
      if (enemy.hitTestObject(this.bowl, true)) {
          return true;
      }
      return false;
  }
})

export default hand