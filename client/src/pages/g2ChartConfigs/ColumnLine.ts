
const uvData = [
  { time: '2019-03', value: 350 },
  { time: '2019-04', value: 900 },
  { time: '2019-05', value: 300 },
  { time: '2019-06', value: 450 },
  { time: '2019-07', value: 470 },
];

const transformData = [
  { time: '2019-03', count: 800 },
  { time: '2019-04', count: 600 },
  { time: '2019-05', count: 400 },
  { time: '2019-06', count: 380 },
  { time: '2019-07', count: 220 },
];

export default {
  forceFit: true,
  title: {
    visible: false,
    text: '柱线混合图',
  },
  description: {
    visible: false,
    text: '柱线混合图表',
  },
  height: 280,
  data: [uvData, transformData],
  xField: 'time',
  yField: ['value', 'count'],
}
