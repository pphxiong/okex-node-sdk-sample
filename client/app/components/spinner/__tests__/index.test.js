import React from 'react';
// import { mount,shallow,render } from 'enzyme';
import renderer from 'react-test-renderer';

import Spinner from '../';

it('[Spinner]组件测试',()=>{
  const props1={};
  const props2={
    global:true,
  };
  const tree1 = renderer.create(
    <Spinner {...props1} />
  ).toJSON();
  expect(tree1).toMatchSnapshot();
  const tree2 = renderer.create(
    <Spinner {...props2} />
  ).toJSON();
  expect(tree2).toMatchSnapshot();
});
















