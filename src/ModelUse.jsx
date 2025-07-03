import {createModel} from './Model';

const useTodoModel = createModel({
	todos: [],
	todo: 'test todo',
	setTodo(value) {
		this.todo = value;
	},
	addTodo() {
		this.todos = [...this.todos, this.todo];
		this.todo = '';
	},
	clearTodos() {
		this.todos = [];
	}
}, { debug: true });


// example of updating the model outside a component
useTodoModel.get().todos = ['My todo'];

function ModelUse() {
	return (
		<div className="App">
			<Model />
			<Pick />
		</div>
	);
}

function Model() {
	const model = useTodoModel.watch(['todo']);
	return (
		<div>
			{/* This is a button to test re-rendering. */}
			<button onClick={()=>model.todo = 'test todo'}>Test Re-Render</button>
			<h2>model</h2>
			todo: {model.todo}<br />
			{/* Notice that we can set the property directly without any helper functions */}
			<input type="text" value={model.todo} onChange={(e) => model.todo = e.target.value} /><br />
		</div>
	)
}

function Pick() {
	/**
	 * if you do supply an argument, it lets you pick elements of the model or register functions executed against the model
	 * Triggers a rerender when a change to a dependency occurs
	 * You can pass a string denoting the property, a function, or a collection (array/object) of strings and functions
	 * Collections will be returned in the same format as the collection passed in
	 *
	 * @example
	 * // single
	 * {useModel}('key') // returns the that `key`s value from the model and watches for changes to it (can also return functions)
	 * {useModel}((model) => model.key) // callback supporting computed values or custom interactions. Dependencies are watched automatically.
	 * // Collections
	 * {useModel}(['key1', 'key2']) // returns [key1, key2] and watches for changes to `key1` and `key2`
	 * {useModel}({ key1: 'key1', key2: (m) => m.key2 }) // returns { key1: key1, key2: key2 } and watches for changes to `key1` and `key2`
	 *
	 * @param {string|function|array|object} arg
	 * @returns {any}
	 */

	// single picks
	const todo = useTodoModel.pick('todo');
	const todos = useTodoModel((model) => model.todos);

	// collection picks
	const [setTodoUsingModelMethod, setTodoUsingCallback] = useTodoModel([
		'setTodo',
		(model) => (value) => model.todo = value
	]);
	const { addTodo, clearTodos } = useTodoModel({
		addTodo: 'addTodo',
		clearTodos: 'clearTodos'
	});


	return (
		<div>
			<h2>Pick</h2>
			<ul>
				{todos.map((todo, index) => <li key={index}>{todo}</li>)}
			</ul>
			<input type="text" value={todo} onChange={(e) => setTodoUsingModelMethod(e.target.value)} /><br />
			<input type="text" value={todo} onChange={(e) => setTodoUsingCallback(e.target.value)} /><br />
			<button onClick={() => addTodo()}>Add</button>
			<button onClick={() => clearTodos()}>Clear Todos</button>
		</div>
	)
}

export default ModelUse;
