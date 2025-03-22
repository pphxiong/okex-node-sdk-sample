const tf = require("@tensorflow/tfjs-node");
console.log("TensorFlow.js 后端:", tf.getBackend()); // 应输出 'tensorflow'

// 尝试简单张量运算
const a = tf.tensor([1, 2]);
const b = tf.tensor([3, 4]);
console.log("张量相加:", a.add(b).arraySync());
