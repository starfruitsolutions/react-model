import {createModel} from './Model';
import './App.css';

/* creates a model */
const useTodoModel = createModel({
	todos: ['todo 1', 'todo 2', 'todo 3'],
	todo: 'test todo',
	setTodo(value) {
		console.log('this', this)
		this.todo = value;
	},
	async addTodo(todo) {
		this.todos = [...this.todos, todo];
	}
}, { debug: true });


function App() {
	console.log('render all');
	return (
		<div className="App">
			<Model />
			<Watch />
			<Pick />
		</div>
	);
}

/* returns the model but doesn't trigger re-render */
function Model() {
	console.log('render model');
	const model = useTodoModel();
	return (
		<div>
			<button onClick={()=>model.todo = 'test todo'}>Test Re-Render</button>
			<h2>model</h2>
			{model.todo}<br />
			<input type="text" value={model.todo} onChange={(e) => model.todo = e.target.value} /><br />
		</div>
	)
}

/* returns whole model and only triggers rerender for state in the array */
function Watch() {
	console.log('render watch');
	const model = useTodoModel(true).watch(['todo']);
	return (
		<div>
			<h2>Watch</h2>
			{model.todo}<br />
			<input type="text" value={model.todo} onChange={(e) => model.todo = e.target.value } /><br />
		</div>
	)
}

/* returns an array of the picked properties and only rerenders on changes to their state */
function Pick() {
	console.log('render pick');
	const { todo, setTodoDirectly } = useTodoModel().pick({ todo: (model) => model.todo, setTodoDirectly: (model) => (value) => model.todo = value });
	const setTodoByMethod = useTodoModel().pick('setTodo');
	const todos = useTodoModel().pick((model) => model.todos );

	return (
		<div>
			<h2>Pick</h2>
			<ul>
				{todos.map((todo, index) => <li key={index}>{todo}</li>)}
			</ul>
			{todo}<br />
			<input type="text" value={todo} onChange={(e) => setTodoByMethod(e.target.value)} /><br />
			<input type="text" value={todo} onChange={(e) => setTodoDirectly(e.target.value)} /><br />
		</div>
	)
}

export default App;
