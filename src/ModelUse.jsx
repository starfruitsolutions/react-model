import {createModel} from './Model';

/**
*   Just wrap a standard javascript object in `createModel`,
*   and you're good to go. All of the properties become reactive
*   state automatically, and you get back a custom hook to use.
*   This can be used in multiple components with no props or
*   context wrapper. It can be exported and used by components
*   anywhere, with no need to pass any around anything else.
*   Update it from anywhere and it will rerender dependent components.
*   You can also keep it in its own file and update it directly, outside
*   of any react component.
**/

const useTodoModel = createModel({
	todos: [],
	todo: 'test todo',
	setTodo(value) {
		console.log('this', this)
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
	/**
	*   If no "watch" array is provided it rerenders on all model property changes.
	*   If it is provided, it only triggers a render for the properties specified.
	*   If an empty array is provided, it doesn't trigger a render at all, but you
	*   can still use the functions, triggering renders elsewhere.
	**/
	const model = useTodoModel(['todo']);
	return (
		<div>
			{/* This is a button to test re-rendering. */}
			<button onClick={()=>model.todo = 'test todo'}>Test Re-Render</button>
			<h2>model</h2>
			{/* Notice that we can set the property directly without any helper functions */}
			<input type="text" value={model.todo} onChange={(e) => model.todo = e.target.value} /><br />
		</div>
	)
}

function Pick() {
	/**
	 * `.pick()` lets you pick elements of the model or register functions executed against the model.
	 * It will automatically watch all dependencies and trigger rerender when any change to a dependency occurs.
	 * You can pass it a propery key, a function, or a collection of strings and functions as an array or object
	 * Collections will be returned in the same format as the collection you passed in
	**/

	// single picks
	const todo = useTodoModel.pick('todo');
	const todos = useTodoModel.pick((model) => model.todos);

	// collection picks
	const [setTodoUsingModelMethod, setTodoUsingCallback] = useTodoModel.pick([
		'setTodo',
		(model) => (value) => model.todo = value
	]);
	const { addTodo, clearTodos } = useTodoModel.pick({
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
