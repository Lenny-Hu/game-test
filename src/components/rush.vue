<template>
  <div class="rush" ref="rush">
    <div class="rush-info">
      <div class="rush-score">得分 {{ score }}</div>
      <div class="rush-time">时间 {{ gameTime }}s</div>
    </div>
    <van-popup v-model:show="show">您本次游戏：{{ score }}分</van-popup>
  </div>
</template>

<script>
import Game from "../lib/rush/index";
export default {
  name: "",
  data() {
    return {
      game: new Game({}, 'test'),
      show: false,
    };
  },
  watch: {
    gameTime(val) {
      if (val == 0) {
        //游戏结束
        setTimeout(() => {
          this.show = true;
        }, 1500);
      }
    },
  },
  computed: {
    score() {
      return this.game.score;
    },
    gameTime() {
      return this.game.gameTime;
    },
  },
  methods: {},
  mounted() {
    this.game.page = this.$refs.fush;
    this.game.init();
  },
};
</script>
<style lang="scss">
.rush {
  position: relative;

  &-info {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 10;
    width: 100%;
    height: 30px;
    line-height: 30px;
    display: flex;

    > div {
      flex: 1;
    }
  }
}
</style>