/**
 * 百分比环状图
*/

export default {
  radius: 1,
  padding: 8,
  data: [],
  label: {
    type: 'spider',
    autoRotate: true,
    formatter: (angleField, colorField) => {
      return [angleField, colorField._origin.type];
    }
  },
  // color: ['#5a93fc', '#90b6fd', '#c8dbfe', '#ffff00'],
  angleField: 'value',
  colorField: 'type',
  statistic: {
    visible: false,
    content: {
      value: '32%',
    },
  },
  legend: {
    visible: false,
    position: 'bottom-center',
  },
  height: 100,
};
