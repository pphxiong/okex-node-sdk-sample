## 函数式编程理解 - curry

> 本体论代表了通过某种方式（如明确的自然语言）明确定义的一个公认的概念集—比如事物、事件和关系—并由此创建一个共同认可的词汇来实现信息交流。

从Monoid到Monad，这些概念都是从范畴论中衍生出来的。理解范畴论的一个好方法是把它理解为应用到函数式编程领域的设计模式。

### 范畴论

> A monad is just a monoid in the category of endofunctors, what's the problem?

范畴论是数学的一门学科，以抽象的方法来处理数学概念，将这些概念形式化成一组组的“物件”及“态射”。

范畴包含以下概念：

1. 一组对象(object)，是需要操作的数据的一个集合
2. 一组态射(morphism)，是数据对象上的映射关系，比如 f: A -> B
3. 态射组合(composition)，就是态射能够几个组合在一起形成一个新的态射

其中态射可以理解是函数，而态射的组合，我们可以理解为函数的组合。而里面的一组对象，就是一个具有一些相同属性的数据集。

直观上，一个对所有存在的分类系统应该满足如下3个条件：

- 有限的： 类的数量是有限的。
- 覆盖的： 任何存在都属于某一类。也就是说类的集合包含宇宙万物。
- 无交的： 任何存在都只属于某一类。也就是说不同的类之间没有相交。

范畴的本质是组合。组合是一个抽象的强力工具，它能够将命令式代码抽象为更可读的声明式代码。

### 编程范式

编程范式是一个比较抽象的概念，它是计算机编程中对风格和模式的提炼，同时也反映了某种心理认知和自然观认知。

以常见的函数式编程和面向对象编程来看，两种编程范式都有各自比较明显的学科特征：

- 函数式编程，是将程序描述为表达式和变换，以数学方程的形式建立模型，并且尽量避免可变的状态；
- 面向对象编程，包含类、对象、封装、继承、多态、重载等机制，通过类和类之间的消息机制建模，提倡针对不同的场景问题构建不同的数据结构，通过方法的调用或消息的互通实现程序交互。

函数式编程偏向于告诉系统去做什么，而不像命令式编程告诉程序如何去实现每一步；面向对象编程则强调程序的组织技术，通过继承机制将松散的类/对象聚合起来，实现对象之间的交流互通。

#### 声明式编程

与命令式编程相对立，声明式编程更加注重于表现代码的逻辑，而不是描述具体的过程。

也就是说，在声明式编程的实践过程中，我们需要更多的告知计算机我们需要什么。比如调用一个具体的函数，而不是用一些抽象的关键字来一行一行的实现我们的需求。

函数式编程的特征主要包括以下几个方面：

- 函数是第一等公民
- 引用透明
- 模块化、组合
- 纯函数，没有副作用
- 避免状态改变
- 避免共享状态

### 几个术语的理解

#### 函子（functor）

函子是用来将两个范畴关联起来的。一般约定，函子的标志就是容器具有map方法。该方法将容器里面的每一个值，映射到另一个容器。并且需要满足下面两个条件：

> fx.map(f).map(g) == fx.map(x => g(f(x)))

> fx.map(x => x) == fx;

JavaScript 中最简单的函数就是Array。

#### 单子（Monad）

> Once you understand Monad, you lose the ability to explain it to someone else.

单子（Monad）是一种将函子组合应用的方法，一个 Monad 就是拥有of以及chain函数的对象。 Chain 类似于 map只不过它会扁平化最终求得的嵌套式结果。Monad 要满足的一些定律如下：

- Left identity: M.of(a).chain(f) === f(a)
- Right identity: m.chain(M.of) === m
- Associativity: m.chain(f).chain(g) === m.chain(x => f(x).chain(g))

#### 幺半群（Monoid）

一个范畴有元素对象和态射箭头，态射箭头有组合和幺元两种，且满足结合律，这种范畴称为Monoid。

一个 monoid 就是与某个恒等值进行组合之后不会影响现有结果的数据类型。

### 柯里化（curry）

柯里化是一个把具有较多 arity 的函数转换成具有较少 arity 函数的过程。柯里化可以使我们只关心函数的部分参数，使函数的用途更加清晰，调用更加简单。

	const curry=(fn,arity=fn.length)=>{
	  const curried=(...args)=>args.length>=arity?fn(...args):(...restArgs)=>curried(...args,...restArgs);
	  return curried;
	};
	
eg:
	
	const add=(a,b,c,d,e)=>a+b+c+d+e;
	
	const addResult=curry(add)(1)(3)(5)(7)(9); //25
	

### 组合（compose）

将多个函数的能力合并，创造一个新的函数。compsoe函数可以接受任意的参数，所有的参数都是函数，且执行方向是自右向左的，初始函数一定放到参数的最右面。

函数组合是为数据流创建一个包含有若干函数的管道。在管道入口，你导入数据，在管道出口，你获得了加工好的数据。但为了让管道工作，管道上的每个函数接受的输入应当与上一步函数的输出拥有同样的数据类型。

	const compose=(...fns)=>(...args)=>{
	  const [...tmpFns]=fns;
	  const composed=(...restArgs)=>{
	    if(tmpFns.length===0){
	      return restArgs[0];
	    }
	    return composed(tmpFns.pop()(...restArgs));
	  };
	  return composed(...args);
	};

eg:

	const getName=id=>id+'-name';
	const getAge=name=>name.split('-')[0];
	
	const getAgeById=compose(getAge,getName);
	const age1=getAgeById(18); //18
	const age2=getAgeById(30); //30

柯里化带给我们的好处：

- 语义更加清晰
- 可复用性更高
- 可维护性更好
- 作用域局限，副作用少
