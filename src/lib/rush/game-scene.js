import utils from "../utils";

export default function (_this) {
  return [
    {
      key: 'home',
      extend: { $game: _this },
      preload: _this.preload,
      create: _this.create,
      update: _this.update,
    },
    {
      key: "game",
      extend: { $game: _this },
      preload: _this.preload,
      create() {
        const gameWidth = this.$game.gameWidth;
        const desHeight = this.$game.desHeight;
        const gameHeight = this.$game.gameHeight;
        const zoom = this.$game.zoom;

        // 加载背景
        this.add.image(
          gameWidth / 2,
          desHeight / 2,
          "game-bg2"
        );

        // 人物跑和跳动画
        this.anims.create({
          key: 'walk',
          frames: this.anims.generateFrameNumbers('people', { frames: [0, 1] }),
          frameRate: 8,
          repeat: -1,
        });

        this.anims.create({
          key: 'jump',
          frames: this.anims.generateFrameNumbers('people', { frames: [2] }),
          frameRate: 8,
          repeat: -1,
        });
        // 添加一个精灵作为载体来控制动画
        let cody = this.add.sprite(gameWidth / 2, (gameHeight / 2) - 100);
        cody.setInteractive();
        cody.play('walk');

        // // 点击起跳
        // this.input.on('pointerdown', function () {
        //   cody.play('jump'); // 起跳
        // });

        // this.input.on('pointerup', function () {
        //   cody.play('walk'); // 松开继续跑
        // });

        // var emitter = new Phaser.Events.EventEmitter();

        // emitter.on('addGold', function (x, y) {
        //   this.add.image(x, y, 'gold');
        // }, this);

        // // 金币
        // emitter.emit('addGold', 200, 300);
        // emitter.emit('addGold', 400, 300);
        // emitter.emit('addGold', 600, 300);

        // 粒子
        var particle = {
          gold: { // 金币
            _: this.add.particles('gold'),
            createEmitter (x, moveToX) {
              console.log('xxxx', x, moveToX);
              return this._.createEmitter({
                x,
                y: gameHeight,
                speedY: -100, // 移动速度，负值为反方向
                moveToX, // 移动到的目标x坐标点
                moveToY: 194,
                lifespan: 4000, // 粒子存活时间 ms
                scale: { start: 1, end: 0.3 }, // 缩放，开始值、最终值
                frequency: utils.getRandomIntInclusive(1000, 2000), // 发射间隔 ms
                alpha: {
                  onEmit () {
                    return Math.random() > 0.2 ? 1 : 0;
                  }
                }
              });
            }
          },
          scenery: { // 仙人掌 和 石头
            cactus: this.add.particles('cactus'),
            rock: this.add.particles('rock'),
            createEmitter (name, x, moveToX) {
              this[name].createEmitter({
                x,
                y: gameHeight,
                speedY: -100, // 移动速度，负值为反方向
                moveToX, // 移动到的目标x坐标点
                moveToY: 194,
                lifespan: 4000, // 粒子存活时间 ms
                scale: { start: 3, end: 0.5 }, // 缩放，开始值、最终值
                frequency: 1000, // 发射间隔 ms
              });
            }
          },
          wood: {
            l: null,
            c: null,
            r: null,
            wood1: this.add.particles('wood1'),
            wood2: this.add.particles('wood2'),
            createEmitter (name, x, moveToX) {
              return this[name].createEmitter({
                x,
                y: gameHeight,
                speedY: -100, // 移动速度，负值为反方向
                moveToX, // 移动到的目标x坐标点
                moveToY: 194,
                lifespan: 4000, // 粒子存活时间 ms
                scale: { start: 1, end: 0.3 }, // 缩放，开始值、最终值
                frequency: 1000, // 发射间隔 ms
                // active: false
                on: false, // false初始化不发射，调用emitParticle发射
                // alpha: {
                //   onEmit () {
                //     return Math.random() > 0.8 ? 1 : 0;
                //   }
                // }
              });
            },
            timer: null,
            fire () {
              // 随机最多2条道路出现木头
              let map = {
                1: 'l',
                2: 'c',
                3: 'r'
              };

              const fn = () => {
                let arr = [];
                let max = utils.getRandomIntInclusive(1, 2);
                while (arr.length < max) {
                  let n = utils.getRandomIntInclusive(1, 3);
                  if (!arr.includes(n)) {
                    arr.push(n);
                  }
                }
                console.log(arr);

                arr.forEach((v) => {
                  Math.random() > 0.6 && particle.wood[map[v]].emitParticle();
                })
              }
              this.timer = setInterval(fn, 1000);
            }
          }
        };
        // 金币相关
        particle.gold.l = particle.gold.createEmitter(gameWidth / 2 - 414 * (zoom + 0.2), 300); // 左
        particle.gold.c = particle.gold.createEmitter(gameWidth / 2, gameWidth / 2); // 中
        particle.gold.r = particle.gold.createEmitter(gameWidth / 2 + 414 * (zoom + 0.2), 350); // 右

        // 风景
        particle.scenery.createEmitter('cactus', -500, 240); // 左
        particle.scenery.createEmitter('cactus', gameWidth + 500, 410); // 右
        setTimeout(() => {
          particle.scenery.createEmitter('rock', -500, 240); // 左
          particle.scenery.createEmitter('rock', gameWidth + 500, 410); // 右
        }, 500);

        // 木头
        particle.wood.l = particle.wood.createEmitter('wood1', gameWidth / 2 - 414 * (zoom + 0.2), 300); // 左
        particle.wood.c = particle.wood.createEmitter('wood1', gameWidth / 2, gameWidth / 2); // 中
        particle.wood.r = particle.wood.createEmitter('wood1', gameWidth / 2 + 414 * (zoom + 0.2), 350); // 右

        this.input.on('pointerup', function () {
          console.log('点击发射');
          particle.wood.fire();
        });

        // var lifespan = 4000; // 粒子存活时间
        // // 计算速度
        // const getSpeedY = (lifespan) => {
        //   let s = (lifespan / 1000);
        //   let yLen = 1600;
        //   let ratio = 194 / yLen;
          
        //   return -((yLen / s) * (1 - ratio) * (this.$game.gameHeight / yLen));
        // }

        // const getSpeedX = (lifespan) => {
        //   let s = (lifespan / 1000);
        //   let xLen = 640 + 94;
        //   let ratio = (300 + 94) / xLen; // 300  394
          
        //   return (xLen / s) * ratio * (this.$game.gameWidth / xLen);
        // }

        // var speedY = getSpeedY(lifespan);
        // var speedX = getSpeedX(lifespan);
        
        // console.log('speedY', speedY, lifespan, speedX);
      },
      update: _this.update,
    },
  ];
}
