import Hilo from 'hilojs';
import bg1 from '../assets/bg1.png';
import bg2 from '../assets/bg2.png';
import txt from '../assets/txt.png';
import zz1 from '../assets/zz1.png';
import zz2 from '../assets/zz2.png';
import zz3 from '../assets/zz3.png';
import people from '../assets/people.png';
import btnStart from '../assets/btn-start.png';
import banana from '../assets/banana.png';
import manImg from '../assets/manImg.jpg';

export default Hilo.Class.create({
  Mixes: Hilo.EventMixin,
  queue: null,  // 下载类
  bg: null,   // 背景
  bg2: null,   // 背景
  bigzZongzi: null,   // 大粽子
  zongzi: null,   // 小粽子
  fruit: null,   // 香蕉
  hand: null,   // 手
  beginBtn: null,   // 开始按钮
  score0: null,   // -1分
  score1: null,   // +1分
  score2: null,   // +2分
  load() {
    let imgs = [
      {
        id: 'bg',
        src: bg1
      },
      {
        id: 'bg2',
        src: bg2
      },
      {
        id: 'txt',
        src: txt
      },
      {
        id: 'bigzZongzi',
        src: zz1
      },
      {
        id: 'zongzi',
        src: zz2
      },
      {
        id: 'zongzi3',
        src: zz3
      },
      {
        id: 'fruit',
        src: banana
      },
      {
        id: 'hand',
        src: people
      },
      {
        id: 'beginBtn',
        src: btnStart
      },
      {
        id: 'score0',
        src: manImg
      },
      {
        id: 'score1',
        src: manImg
      },
      {
        id: 'score2',
        src: manImg
      }
    ];
    this.queue = new Hilo.LoadQueue();
    this.queue.add(imgs);
    this.queue.on('complete', this.onComplete.bind(this));
    this.queue.on('error', function (err) {
      console.error(err);
    });
    this.queue.start();
    console.log(1111);
  },
  onComplete() { //加载完成
    console.log('加载完成??????');
    this.bg = this.queue.get('bg').content;
    this.bg2 = this.queue.get('bg2').content;
    this.txt = this.queue.get('txt').content;
    this.bigzZongzi = this.queue.get('bigzZongzi').content;
    this.zongzi = this.queue.get('zongzi').content;
    this.zongzi3 = this.queue.get('zongzi3').content;

    this.fruit = this.queue.get('fruit').content;
    this.hand = this.queue.get('hand').content;
    this.beginBtn = this.queue.get('beginBtn').content;
    this.score0 = this.queue.get('score0').content;
    this.score1 = this.queue.get('score1').content;
    this.score2 = this.queue.get('score2').content;

    //删除下载队列的complete事件监听
    this.queue.off('complete');
    // complete暴露
    this.fire('complete');
  }
})
