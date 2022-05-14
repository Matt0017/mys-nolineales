import logo from './logo.svg';
import './App.css';
import React, { Component } from 'react';
import { acos, dot, evaluate, norm, pi, pow, sqrt } from 'mathjs'
import 'math-expression-evaluator'
import 'nerdamer'
import nerdamer from 'nerdamer/all';

class App extends Component {

	constructor()
	{
		super();
		this.canvas = React.createRef(null);

		this.offset = {
			x: 0,
			y: 0
		};
		this.dragAnchor = {
			x: -1,
			y: -1
		};
		this.scale = 200;

		this.xdotexpression = "";
		this.ydotexpression = "";
		
		this.xSolution = {
			x: [],
			y: []
		}
		this.ySolution = {
			x: [],
			y: []
		}

		this.state = {
			bShowNuclinas: true
		}
	}

	componentDidMount()
	{
		var canvas = this.canvas.current;
		if (!canvas)
		{
			return;
		}

		this.setupCanvas(canvas);

		this.Draw();
	}

	setupCanvas(canvas)
	{
		var cs = getComputedStyle(canvas);
		canvas.width = parseInt(cs.getPropertyValue('width'), 10);
		canvas.height = parseInt(cs.getPropertyValue('height'), 10);
	}

	onCanvasDragStart(event)
	{
		event.stopPropagation();
		event.preventDefault();

		this.dragAnchor = {
			x: event.clientX,
			y: event.clientY
		};
	}

	onCanvasDragEnd(event)
	{
		this.dragAnchor.x = -1;
		this.dragAnchor.y = -1;
	}

	onCanvasDrag(event)
	{
		if (this.dragAnchor.x >= 0 && this.dragAnchor.x >= 0)
		{
			this.offset = {
				x: this.offset.x + (event.clientX - this.dragAnchor.x),
				y: this.offset.y + (event.clientY - this.dragAnchor.y)
			};
			this.dragAnchor = {
				x: event.clientX,
				y: event.clientY
			};
			this.Draw();
		}
	}

	Draw()
	{
		var canvas = this.canvas.current;
		var ctx = canvas.getContext("2d");

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		var axes = {};
		axes.x0 = this.offset.x + .5 + .5 * canvas.width;	// x0 pixels from left to x=0
		axes.y0 = this.offset.y + .5 + .5 * canvas.height;	// y0 pixels from top to y=0
		axes.scale = this.scale;							// 40 pixels from x=0 to x=1

		this.showAxes(ctx, axes);

		this.drawFlowLines(ctx, axes);

		if (this.state.bShowNuclinas)
		{
			this.drawNuclinas(ctx, axes);
		}
	}

	showAxes(ctx, axes)
	{
		const rulerLength = 10;

		var w = ctx.canvas.width, h = ctx.canvas.height;
		var xmin = 0;

		ctx.beginPath();
		ctx.strokeStyle = "rgb(0,0,0)";
		ctx.lineWidth = 2;
		ctx.moveTo(xmin, axes.y0); ctx.lineTo(w, axes.y0);  // X axis
		ctx.moveTo(axes.x0, 0);    ctx.lineTo(axes.x0, h);  // Y axis
		
		// Ruler on X
		var lineIndex = 0;
		var offset = lineIndex * axes.scale; // add to line index
		while (axes.x0 + offset < w || axes.x0 - offset > 0)
		{
			ctx.moveTo(axes.x0 + offset, axes.y0-rulerLength/2); ctx.lineTo(axes.x0 + offset, axes.y0+rulerLength/2);
			ctx.moveTo(axes.x0 - offset, axes.y0-rulerLength/2); ctx.lineTo(axes.x0 - offset, axes.y0+rulerLength/2);
			
			++lineIndex;
			offset = lineIndex * axes.scale;
		}

		// Ruler on Y
		var lineIndex = 0;
		var offset = lineIndex * axes.scale; // add to line index
		while (axes.y0 + offset < h || axes.y0 - offset > 0)
		{
			ctx.moveTo(axes.x0-rulerLength/2, axes.y0 + offset); ctx.lineTo(axes.x0+rulerLength/2, axes.y0 + offset);
			ctx.moveTo(axes.x0-rulerLength/2, axes.y0 - offset); ctx.lineTo(axes.x0+rulerLength/2, axes.y0 - offset);
			
			++lineIndex;
			offset = lineIndex * axes.scale;
		}
		ctx.stroke();
		ctx.lineWidth = 1;
	}
	
	drawFlowLines(ctx, axes)
	{
		const flowlineCount = 20;
		const flowlineSteps = 20;
		const flowlineStepLength = 1 / this.scale;
		const tipLength = 10;

		const spaceInBetweenX = ctx.canvas.width / (flowlineCount - 3);
		const spaceInBetweenY = ctx.canvas.height / (flowlineCount - 3);
		
		const drawTip = function(from, to) {
			const direction = {
				x: to.x - from.x,
				y: to.y - from.y
			}
			const angle = Math.atan2(direction.y, direction.x);
			ctx.moveTo(to.x, to.y);
			ctx.lineTo(to.x - tipLength * Math.cos(angle - Math.PI / 6), to.y - tipLength * Math.sin(angle - Math.PI / 6));
			ctx.moveTo(to.x, to.y);
			ctx.lineTo(to.x - tipLength * Math.cos(angle + Math.PI / 6), to.y - tipLength * Math.sin(angle + Math.PI / 6));
		}
		const smoothenDirection = (d) => { return sqrt(Math.abs(d)) * Math.sign(d); };

		if (this.xdotexpression != "" && this.ydotexpression != "")
		{
			ctx.beginPath();
			ctx.strokeStyle = "rgb(50,100,178)"; 
			for (let x = -1; x < flowlineCount; x++)
			{
				const xPos = x * spaceInBetweenX + (this.offset.x % spaceInBetweenX);

				for (let y = -1; y < flowlineCount; y++)
				{
					const yPos = y * spaceInBetweenY + (this.offset.y % spaceInBetweenY);
					ctx.moveTo(xPos, yPos);

					let point = this.pixelToPoint(axes, xPos, yPos);

					// draw line

					let pDir, pPoint, ppPoint, screenPos = null;
					let flowlineStepLengthMod = 1;
					let skipNextLine = false;

					for (let step = 0; step < flowlineSteps; step++)
					{
						let dir = this.evaluateExpressions(point);

						if (pDir)
						{
							let xChangeOfDir = dir.x * pDir.x < 0,
								yChangeOfDir = dir.y * pDir.y < 0;

							let importantChange = (xChangeOfDir && Math.abs(dir.x) > 0.1) || (yChangeOfDir && Math.abs(dir.y) > 0.1) ;
							
							if (importantChange)
							{
								let angle = acos(
									dot([dir.x,dir.y], [pDir.x,pDir.y])
									/
									(norm([dir.x,dir.y]) * norm([pDir.x,pDir.y]))
									) * 180 / pi;
								if (angle > 89)
								{
									point.x -= smoothenDirection(pDir.x) * flowlineStepLength * flowlineStepLengthMod;
									point.y -= smoothenDirection(pDir.y) * flowlineStepLength * flowlineStepLengthMod;

									pPoint = ppPoint;

									flowlineStepLengthMod /= 2;
									step--;
									skipNextLine = true;
									continue;
								}
							}
						}
						
						if (skipNextLine)
						{
							skipNextLine = false;
						}
						else if (screenPos)
						{
							ctx.lineTo(screenPos.x, screenPos.y);
						}
						
						point.x += smoothenDirection(dir.x) * flowlineStepLength * flowlineStepLengthMod;
						point.y += smoothenDirection(dir.y) * flowlineStepLength * flowlineStepLengthMod;

						screenPos = this.pointToPixel(axes, point.x, point.y)

						// ctx.lineTo(screenPos.x, screenPos.y);
						// we draw the line at the very beginning of the next iteration to avoid going over

						// draw arrow tip
						if (step == flowlineSteps-1)
						{
							drawTip(this.pointToPixel(axes, pPoint.x, pPoint.y), screenPos);
						}

						pDir = Object.assign({}, dir);
						ppPoint = pPoint ? Object.assign({}, pPoint) : null;
						pPoint = Object.assign({}, point);
					}
					if (screenPos)
					{
						ctx.lineTo(screenPos.x, screenPos.y);
					}
				}
			}
			ctx.stroke();
		}
	}

	drawNuclinas(ctx, axes)
	{
		if (this.xdotexpression == "" || this.ydotexpression == "")
		{
			return;
		}
		
		// Nuclina X
		ctx.strokeStyle = "rgb(200,0,200)";
		this.drawNuclinaInDirection(ctx, axes, this.xSolution.x, true);
		this.drawNuclinaInDirection(ctx, axes, this.xSolution.y, false);
		
		// Nuclina Y
		ctx.strokeStyle = "rgb(120,0,120)";
		this.drawNuclinaInDirection(ctx, axes, this.ySolution.x, true);
		this.drawNuclinaInDirection(ctx, axes, this.ySolution.y, false);

		ctx.stroke();
	}

	drawNuclinaInDirection(ctx, axes, solutions, xDirection)
	{
		const increment = 5;

		const limit = xDirection ? ctx.canvas.height : ctx.canvas.width;
		const subVar = xDirection ? 'y': 'x';

		let current = -increment

		ctx.beginPath();

		let pCurrent = null;
		let pSolutions = [];
		pSolutions.length = solutions.length;

		while (current <= limit + increment)
		{
			const currentPoint = xDirection ? this.YToPoint(axes, current) : this.XToPoint(axes, current); 
			
			for (let sI = 0; sI < solutions.length; sI++)
			{
				let scope = {};
				scope[subVar] = currentPoint;
				const point = evaluate(solutions[sI].toString(), scope)

				let value = this.numberFromExpression(point);
				let valuePixel =  xDirection ? this.XToPixel(axes, value) : this.YToPixel(axes, value);

				const distance = Math.max(Math.abs(pCurrent - current), Math.abs(pSolutions[sI] - valuePixel));
				if (pCurrent !== null && distance < increment*3)
				{
					if (xDirection)
					{
						ctx.moveTo(pSolutions[sI], pCurrent);
						ctx.lineTo(valuePixel, current);
					}
					else
					{
						ctx.moveTo(pCurrent, pSolutions[sI]);
						ctx.lineTo(current, valuePixel);
					}
				}

				pSolutions[sI] = valuePixel;
			}

			pCurrent = current;
			current += increment;
		}

		ctx.stroke();
	}

	numberFromExpression(exp)
	{
		exp = exp.toString();
		
		var number = Number(exp);
		if (!isNaN(number))
		{
			return number;
		}
		
		let fract = exp.toString().split("/");
		if (fract.length == 2)
		{
			return (parseInt(fract[0]) / parseInt(fract[1]));
		}

		return NaN;
	}

	pixelToPoint(axes, x, y)
	{
		return {
			x: this.XToPoint(axes, x),
			y: this.YToPoint(axes, y),
		}
	}
	XToPoint(axes, x) { return (x - axes.x0) / axes.scale; }
	YToPoint(axes, y) { return ((y - axes.y0) / axes.scale)*-1; }

	pointToPixel(axes, x, y)
	{
		return {
			x: this.XToPixel(axes, x),
			y: this.YToPixel(axes, y),
		}
	}
	XToPixel(axes, x) { return x * axes.scale + axes.x0; }
	YToPixel(axes, y) { return y * -1 * axes.scale + axes.y0; }

	evaluateExpressions(point)
	{
		try {
			var x = evaluate(this.xdotexpression, {x: point.x, y: point.y});
			var y = evaluate(this.ydotexpression, {x: point.x, y: point.y});
			return { x: x, y: y};
		}
		catch
		{
			return -1;	
		}
	}

	zoomCanvas(event)
	{
		const displacement = 1.25;
		const minScale = 50;

		if (event.deltaY < 0)
		{
			this.scale *= displacement;
			this.offset.x *= displacement; this.offset.y *= displacement;
		}
		else if (event.deltaY > 0 && this.scale / displacement > minScale)
		{
			this.scale /= displacement;
			this.offset.x /= displacement; this.offset.y /= displacement;
		}
		this.Draw();
	}

	updateXDotExpression(event)
	{
		this.xdotexpression = event.target.value.toLocaleLowerCase();
		this.prepareSolutionFromExpression(this.xdotexpression, this.xSolution);

		this.Draw();
	}

	updateYDotExpression(event)
	{
		this.ydotexpression = event.target.value.toLocaleLowerCase();
		this.prepareSolutionFromExpression(this.ydotexpression, this.ySolution);
		
		this.Draw();
	}

	prepareSolutionFromExpression(expression, solution)
	{
		// Pre calculate solutions for x and y (if applies) for the expression
		const includesX = expression.indexOf('x') != -1;
		const includesY = expression.indexOf('y') != -1;

		const nExpression = nerdamer(expression)

		solution.x = includesX ? nExpression.solveFor('x').map( exp => exp.toString()) : []
		solution.y = includesY ? nExpression.solveFor('y').map( exp => exp.toString()) : []
	}

	ShowNuclinas(event)
	{
		this.setState({ bShowNuclinas: event.target.checked })
		this.Draw();
	}

	render()
	{
		return <div className="App" onMouseMove={(e) => this.onCanvasDrag(e)} onMouseUp={(e) => this.onCanvasDragEnd(e)}>
			<header className="App-header">
				<div className='container'>
					<div className='inputs'>
						x dot <input onChange={(e) => this.updateXDotExpression(e)}></input><br/>
						y dot <input onChange={(e) => this.updateYDotExpression(e)}></input><br/>
						Nuclinas <input type="checkbox" onChange={(e) => this.ShowNuclinas(e)} checked={this.state.bShowNuclinas}></input><br/>
					</div>
					<div className="canvas-container">
						<canvas ref={this.canvas} className="main-canvas"
							onDragStart={(e) => this.onCanvasDragStart(e)} draggable={true}
							onWheel={(e) => this.zoomCanvas(e)}>
							
						</canvas>
					</div>
				</div>
			</header>
		</div>
	}
}

export default App;
