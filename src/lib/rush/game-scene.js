import Phaser from 'phaser';
import utils from "../utils";
var cursors = null;
var player = null;
var particle = null;

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

        cursors = this.input.keyboard.createCursorKeys();

        // 加载背景
        this.add.image(
          gameWidth / 2,
          desHeight / 2,
          "game-bg2"
        );

        // this.input.on('dragstart', function (pointer, obj) {
        //   obj.body.moves = false;
        // });

        // this.input.on('drag', function (pointer, obj, dragX) {
        //   console.log(obj);
        //   obj.setPosition(dragX, obj.y);
        // });

        // this.input.on('dragend', function (pointer, obj) {
        //   obj.body.moves = true;
        // });

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
        particle = {
          gold: { // 金币
            _: this.add.particles('gold'),
            createEmitter(x, moveToX) {
              console.log('xxxx', x, moveToX);
              return this._.createEmitter({
                name: 'gold',
                x,
                y: gameHeight,
                speedY: -100, // 移动速度，负值为反方向
                moveToX, // 移动到的目标x坐标点
                moveToY: 194,
                lifespan: 4000, // 粒子存活时间 ms
                scale: { start: 1, end: 0.3 }, // 缩放，开始值、最终值
                frequency: utils.getRandomIntInclusive(1000, 2000), // 发射间隔 ms
                // alpha: {
                //   onEmit () {
                //     return Math.random() > 0.2 ? 1 : 0;
                //   }
                // }
              });
            }
          },
          scenery: { // 仙人掌 和 石头
            cactus: this.add.particles('cactus'),
            rock: this.add.particles('rock'),
            createEmitter(name, x, moveToX) {
              this[name].createEmitter({
                name: 'scenery',
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
            createEmitter(name, x, moveToX) {
              return this[name].createEmitter({
                name,
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
            fire() {
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
        // particle.wood.fire();

        // this.input.on('pointerdown', function () {
        //   console.log('点击发射');
        //   console.log(cursors, player.body.touching);
        // });

        // 给金币、木头、和人添加物理属性
        // this.physics.world.enable([
        // cody,
        // particle.gold.l,
        // particle.gold.c,
        // particle.gold.r,
        // particle.wood.l,
        // particle.wood.c,
        // particle.wood.r 
        // ]);
        // this.physics.add.collider(player, particle.gold.c);
        // player.body.setCollideWorldBounds(true);

        // this.physics.add.overlap(player, particle.gold.c, function (player, gold) {
        //   {
        //     gold.disableBody(true, true);
        //   }
        // }, null, this);

        // this.physics.add.overlap(particle.gold.c, cody, function (c)

        // {
        //   console.log('碰撞了', c);
        //     // clownOnBlock.body.stop();
        //     // this.physics.world.removeCollider(collider);
        // }, null, this);

        // cursors = this.input.keyboard.createCursorKeys();

        // this.physics.add.collider(particle.wood.l, particle.gold.l);

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
        // let cody = player = this.add.sprite(gameWidth / 2, (gameHeight / 2) - 100);
        let cody = player = this.physics.add.sprite(gameWidth / 2, (gameHeight / 2) - 100);
        cody.play('walk');
        cody.setZ(10);
        player.setCollideWorldBounds(true);
        cody.setInteractive();
        console.log(cody);
        let enadleSwipe = false;

        // this.input.setDraggable(cody.setInteractive());
        cody.on('pointerdown', function () {
          console.log('在人身上按下，启动滑动');
          enadleSwipe = true;
        });
        this.input.on('pointerup', function (e, obj) {
          console.log('按下抬起了', e, obj);
          if (!enadleSwipe) {
            return false;
          }
          enadleSwipe = false;

          // 计算按住时间
          let swipeTime = e.upTime - e.downTime;

          // 生成 {x: v1, y: v2} 格式
          let swipe = new Phaser.Geom.Point(e.upX - e.downX, e.upY - e.downY);

          // 获取对角线长度
          let swipeMagnitude = Phaser.Geom.Point.GetMagnitude(swipe);

          // 偏向方向比例 1 为直着朝一个方向
          let swipeNormal = new Phaser.Geom.Point(swipe.x / swipeMagnitude, swipe.y / swipeMagnitude);

          /**
         * 滑动的对角线长度大于 20
         * 滑动的时间小于 1000 毫秒
         * 滑动的角度尽量偏一个方向
         */
          if (swipeMagnitude > 20 && swipeTime < 1000 && (Math.abs(swipeNormal.y) > .8 || Math.abs(swipeNormal.x) > .8)) {
            let len = 180;
            let c = gameWidth / 2;

            if (swipeNormal.x > .8) {
              console.log('向右')
              player.x + len <= c + len  && (player.x += len);
            }

            if (swipeNormal.x < -.8) {
              console.log('向左')
              player.x - len >= c - len  && (player.x -= len);
            }

            if (swipeNormal.y > .8) {
              console.log('向下')
            }

            if (swipeNormal.y < -.8) {
              console.log('向上')
            }
          }
        });

        console.log(cursors, player);
        // console.log('speedY', speedY, lifespan, speedX);
      },
      update() {
        // console.log('游戏更新');
        // player.body.setVelocity(0);
        // this.physics.add.overlap(player, particle.gold.c);

        // if (player.body.touching.left) {
        //   console.log(1111);
        //   player.setVelocityX(-300);
        // }

        // if (cursors.left.isDown) {
        // player.body.setVelocityX(-300);
        // }
        // else if (cursors.right.isDown) {
        // player.body.setVelocityX(300);
        // }

        // if (cursors.up.isDown) {
        //   player.body.setVelocityY(-300);
        // }
        // else if (cursors.down.isDown) {
        //   player.body.setVelocityY(300);
        // }
        // this.physics.world.collide(sprite1, sprite2);
      },
    },
  ];
}
