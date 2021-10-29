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
        // 加载背景
        this.add.image(
          this.$game.gameWidth / 2,
          this.$game.desHeight / 2,
          "game-bg2"
        );
        
        // 走和跳动画
        this.anims.create({
          key: 'walk',
          frames: this.anims.generateFrameNumbers('people', { frames: [ 0, 1 ] }),
          frameRate: 8,
          repeat: -1,
        });

        this.anims.create({
          key: 'jump',
          frames: this.anims.generateFrameNumbers('people', { frames: [ 2 ] }),
          frameRate: 8,
          repeat: -1,
        });
        // 添加一个精灵作为载体来控制动画
        const cody = this.add.sprite(this.$game.gameWidth / 2, (this.$game.gameHeight / 2) - 100);
        cody.play('walk');

        // 点击起跳
        this.input.on('pointerdown', function () {
          cody.play('jump'); // 起跳
        });
      },
      update: _this.update,
    },
  ];
}
