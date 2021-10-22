import Hilo from 'hilojs';

const Bus = Hilo.Class.create({
  Mixes: Hilo.EventMixin,
  constructor() {}
});
const bus = new Bus();
export default bus;


