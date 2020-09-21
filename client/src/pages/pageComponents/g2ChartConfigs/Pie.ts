const data = [
  {
    type: '已通过',
    value: 27,
  },
  {
    type: '待审核',
    value: 25,
  },
  {
    type: '已驳回',
    value: 18,
  },
];
export default {
  forceFit: true,
  padding: [10, 180, 20, 10],
  title: {
    visible: false,
    text: '多色饼图',
  },
  radius: 1,
  color: ['#348FE1', '#CFE2F7', '#EEEFF1'],
  data,
  angleField: 'value',
  colorField: 'type',
  height: 120,
  tooltip: { visible: false },
  label: {
    visible: false,
    type: 'inner',
  },
};
