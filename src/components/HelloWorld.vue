<template>
  <div class="hilo" ref="hilo">
    <div class="hilo-info">
      <div class="hilo-score">得分 {{ score }}</div>
      <div class="hilo-time">时间 {{ gameTime }}s</div>
    </div>
    <van-popup v-model:show="show">您本次游戏：{{ score }}分</van-popup>
  </div>
</template>

<script>
// import Hilo from "hilojs";\
import Game from "../lib/game";
export default {
  name: "",
  data() {
    return {
      game: new Game(),
      show: false,
    };
  },
  watch: {
    gameTime(val) {
      console.log('val???');
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
    this.game.page = this.$refs.hilo;
    this.game.init();
  },
};
</script>
<style lang="scss">
.hilo {
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