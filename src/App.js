import './App.css';
import React, { Component } from 'react';
import { acos, all, create, dot, evaluate, norm, pi, pow, sqrt } from 'mathjs'
import 'math-expression-evaluator'
import 'nerdamer'
import nerdamer from 'nerdamer/all';
import Llave from './soporte-abierto.png'

class App extends Component {

//#region Variables
	offset = {
		x: 0,
		y: 0
	};

	dragAnchor = {
		x: -1,
		y: -1
	};

	clickAnchor = {
		x: -1,
		y: -1
	};

	scale = 200;

	xdotexpression = "";
	ydotexpression = "";

	xSolution = {
		x: [],
		y: []
	};

	ySolution = {
		x: [],
		y: []
	};

	bShowNuclinas = true;

	axes = { };

	/** Points of interest to draw lines from. in numeric coordinates */
	POIs = [];
	POE = [];

//#endregion

//#region Constructor and Setup
	constructor()
	{
		super();
		this.canvas = React.createRef(null);

		this.state = {
			bShowNuclinas: true,
			POE: ""
		}

		let config = {
			predictable: true
		}
		this.math = create(all, config);
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
//#endregion

//#region Draw functions
	Draw()
	{
		var canvas = this.canvas.current;
		var ctx = canvas.getContext("2d");

		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		var axes = this.axes;
		axes.x0 = this.offset.x + .5 + .5 * canvas.width;	// x0 pixels from left to x=0
		axes.y0 = this.offset.y + .5 + .5 * canvas.height;	// y0 pixels from top to y=0
		axes.scale = this.scale;							// 40 pixels from x=0 to x=1

		this.drawAxes(ctx, axes);

		this.drawFlowLines(ctx, axes);

		if (this.bShowNuclinas)
		{
			this.drawNuclinas(ctx, axes);
		}

		for (let i = 0; i < this.POIs.length; ++i)
		{
			const POI = this.POIs[i];
			this.drawFullFlow(ctx, axes, POI);
		}

		this.DrawPOE(ctx, axes);
	}

	drawAxes(ctx, axes)
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

		const spaceInBetweenX = ctx.canvas.width / (flowlineCount - 3);
		const spaceInBetweenY = ctx.canvas.height / (flowlineCount - 3);

		if (this.xdotexpression !=="" && this.ydotexpression !=="")
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

					let point = this.pixelCoordsToPoint(axes, xPos, yPos);

					this.drawFlowLine(ctx, axes, point, { flowlineSteps: flowlineSteps })
				}
			}
			ctx.stroke();
		}
	}

	drawFullFlow(ctx, axes, POI)
	{
		ctx.beginPath();
		ctx.strokeStyle = "rgb(0,0,0)";
		ctx.lineWidth = 2;
		this.drawFlowLine(ctx, axes, POI, { checkOOB: true, flowlineStepLength: 5 });
		ctx.stroke();
		ctx.lineWidth = 1;
	}

	drawFlowLine(ctx, axes, point, params)
	{
		point = Object.assign({}, point);

		if (!params.flowlineSteps)
		{
			params.flowlineSteps = 1000;
		}
		if (!params.flowlineStepLength)
		{
			params.flowlineStepLength = 1;
		}
		if (!params.checkOOB)
		{
			params.checkOOB = false;
		}

		const flowlineStepLength = params.flowlineStepLength / this.scale;
		const slowdownLimit = 5;
		const oobLimit = 20;

		const isOutOfBounds = (pos, dir, limit) =>
		{
			if (pos < 0 && dir < 0 && pos < -oobLimit)
			{
				return true;
			} 
			if (pos > limit && dir > 0 && (pos - limit) > oobLimit)
			{
				return true;
			}
			return false;
		}

		let pDir, pPoint, ppPoint, screenPos = null;
		let flowlineStepLengthMod = 1, slowdownCounter = 0;
		let skipNextLine = false;

		for (let step = 0; step < params.flowlineSteps; step++)
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
						if (slowdownCounter === slowdownLimit)
						{
							break;
						}
						point.x -= this.smoothenDirection(pDir.x) * flowlineStepLength * flowlineStepLengthMod;
						point.y -= this.smoothenDirection(pDir.y) * flowlineStepLength * flowlineStepLengthMod;

						pPoint = ppPoint;

						flowlineStepLengthMod /= 2;
						slowdownCounter++;
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
				if (params.checkOOB && (isOutOfBounds(screenPos.x, dir.x, ctx.canvas.width) || isOutOfBounds(screenPos.y, -dir.y, ctx.canvas.height)))
				{
					break;
				}
				ctx.lineTo(screenPos.x, screenPos.y);
			}
			
			point.x += this.smoothenDirection(dir.x) * flowlineStepLength * flowlineStepLengthMod;
			point.y += this.smoothenDirection(dir.y) * flowlineStepLength * flowlineStepLengthMod;

			screenPos = this.pointToPixel(axes, point);

			// ctx.lineTo(screenPos.x, screenPos.y);
			// we draw the line at the very beginning of the next iteration to avoid going over

			// draw arrow tip
			if (step === params.flowlineSteps-1)
			{
				this.drawTip(ctx, this.pointToPixel(axes, pPoint), screenPos, { tipLength: 10 });
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

	drawNuclinas(ctx, axes)
	{
		if (this.xdotexpression === "" || this.ydotexpression === "")
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
		this.drawNuclinaInDirection(ctx, axes, this.ySolution.y, false, this.ydotexpression);

		ctx.stroke();
	}

	drawNuclinaInDirection(ctx, axes, solutions, xDirection, altExpression)
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
				
				let point = this.AproximateComplex(this.math.evaluate(solutions[sI].toString(), scope));

				if (point.isComplex)
				{
					continue;
				}

				if (typeof(point) === 'number' && isNaN(point))
				{
					// We are dealing with complex numbers, we need a more robust solution
					// As of now, we don't have one, so just // TODO log a "not spamy" warning to the user

					// const altsolution = nAltExpression.sub(subVar, currentPoint).solveFor(solveVar).map( s => s.evaluate().toString());
					continue;
				}


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

	DrawPOE(ctx, axes)
	{
		const radius = 5;

		for (let i = 0; i < this.POE.length; i++)
		{
			const POE = this.POE[i];
			const pixelPOE = this.pointToPixel(axes, POE);
			
			ctx.fillStyle = "#00D0D0";
			ctx.beginPath();
			ctx.arc(pixelPOE.x, pixelPOE.y, radius, 0, 2 * this.math.pi);
			ctx.fill();
		}
	}
//#endregion

//#region Utilities
	numberFromExpression(exp)
	{
		exp = exp.toString();
		
		var number = Number(exp);
		if (!isNaN(number))
		{
			return number;
		}
		
		let fract = exp.toString().split("/");
		if (fract.length === 2)
		{
			return (parseInt(fract[0]) / parseInt(fract[1]));
		}

		return NaN;
	}

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

	pixelCoordsToPoint(axes, x, y)
	{
		return {
			x: this.XToPoint(axes, x),
			y: this.YToPoint(axes, y),
		}
	}
	XToPoint(axes, x) { return (x - axes.x0) / axes.scale; }
	YToPoint(axes, y) { return ((y - axes.y0) / axes.scale)*-1; }

	pointToPixel(axes, point)
	{
		return this.pointCoordsToPixel(axes, point.x, point.y); 
	}
	pointCoordsToPixel(axes, x, y)
	{
		return {
			x: this.XToPixel(axes, x),
			y: this.YToPixel(axes, y),
		}
	}
	XToPixel(axes, x) { return x * axes.scale + axes.x0; }
	YToPixel(axes, y) { return y * -1 * axes.scale + axes.y0; }

	smoothenDirection(d) { return sqrt(Math.abs(d)) * Math.sign(d); }

	/** Moves and draws an arrow tip. doesn't perform a stroke. Does not draw a line between from an to. */
	drawTip(ctx, from, to, params) {
		const direction = {
			x: to.x - from.x,
			y: to.y - from.y
		}
		const angle = Math.atan2(direction.y, direction.x);
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x - params.tipLength * Math.cos(angle - Math.PI / 6), to.y - params.tipLength * Math.sin(angle - Math.PI / 6));
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x - params.tipLength * Math.cos(angle + Math.PI / 6), to.y - params.tipLength * Math.sin(angle + Math.PI / 6));
	}
//#endregion

//#region Math
	DeterminePOE(expression, solutionFor1, expression2, solutionFor2)
	{
		if (this.xdotexpression === "" || this.xdotexpression === "")
		{
			return;
		}
		
		this.POE = [];
		
		{
			const includesX = expression.indexOf('x') !==-1;
			const includesY = expression.indexOf('y') !==-1;

			let totalFound = [];

			//TODO cuidado con el caso en que f(x) = g(x), van a tirar las raices junto con y = 0
			// Both have x
			if (includesX && solutionFor2.x.length > 0)
			{
				const foundPOEs1 = this.DeterminePOE_Internal(expression, expression2, solutionFor2, true);
				const foundPOEs2 = this.DeterminePOE_Internal(expression2, expression, solutionFor1, true);
				totalFound = foundPOEs1.concat(foundPOEs2);
			}

			// Both have y
			if (includesY && solutionFor2.y.length > 0)
			{
				const foundPOEs1 = this.DeterminePOE_Internal(expression, expression2, solutionFor2, false);
				const foundPOEs2 = this.DeterminePOE_Internal(expression2, expression, solutionFor1, false);
				totalFound.push(foundPOEs1.concat(foundPOEs2));
			}

			console.log(totalFound);
			for (let i = 0; i < totalFound.length; i++)
			{
				const poe = totalFound[i];
				if (!this.POE.includes((p) => this.IsNear(p.x, poe.x) && this.IsNear(p.y, poe.y)))
				{
					this.POE.push(poe);
				}
			}

			if (this.POE.length > 0)
			{
				return;
			}
		}

		//If they share no variables then let each one determine a variable
		const fHasX = solutionFor1.x.length > 0;
		const fHasY = solutionFor1.y.length > 0;
		const sHasX = solutionFor2.x.length > 0;
		const sHasY = solutionFor2.y.length > 0;

		if ((fHasX && sHasY) || (fHasY && sHasX))
		{
			const fVar = fHasX ? 'x' : 'y';
			const sVar = sHasY ? 'y' : 'x';

			for (let sFI = 0; sFI < solutionFor1[fVar].length; sFI++)
			{
				const sF = solutionFor1[fVar][sFI];
				const f = this.AproximateComplex(this.math.evaluate(sF.toString()));
				
				if (f.isComplex)
				{
					continue;
				}
				
				for (let sSI = 0; sSI < solutionFor2[sVar].length; sSI++)
				{
					const sS = solutionFor2[sVar][sSI];
					const s = this.AproximateComplex(this.math.evaluate(sS.toString()));

					if (!s.isComplex)
					{
						this.POE.push({
							x: fHasX ? f : s,
							y: fHasY ? f: s
						});
					}
				}
			}
		}

		//TODO uno puede ser 0 directamente

		console.warn("idk");
	}

	DeterminePOE_Internal(expression, expression2, solutionFor2, subX)
	{
		const subVar = subX ? 'x' : 'y';
		const solveVar = subX ? 'y' : 'x';

		const nExpression = nerdamer(expression)

		let foundPOEs = [];

		// Substitute one equation for the other and get one value
		let solveValues = [];
		for (let sI = 0; sI < solutionFor2[subVar].length; sI++)
		{
			const solution = solutionFor2[subVar][sI];
			
			let solveVarSolutions;
			try
			{
				solveVarSolutions = nExpression.sub(subVar, solution).evaluate().solveFor(solveVar);
			} catch (e)
			{
				console.log(e);
				continue;
			}
			
			for (let sI = 0; sI < solveVarSolutions.length; sI++)
			{
				const solveS = this.AproximateComplex(solveVarSolutions[sI]);
				
				if (solveS.isImaginary())
				{
					continue;
				}
				// super ineficiente pero bueno
				if (!solveValues.includes((s) => s.toString() === solveS.toString()))
				{
					solveValues.push(solveS);
				}
			}
		}
		// Get the other value from one expression
		let pairs = [];
		for (let sI = 0; sI < solveValues.length; sI++)
		{
			const s = solveValues[sI];
			
			for (let sI = 0; sI < solutionFor2[subVar].length; sI++)
			{
				const solution = solutionFor2[subVar][sI];
				const sub = this.AproximateComplex(solution.sub(solveVar, s).evaluate());

				if (!sub.isImaginary())
				{
					const subNum = this.numberFromExpression(evaluate(sub.toString()));
					const solveNum = this.numberFromExpression(evaluate(s.toString()));
					const pair = {
						x: subX ? subNum : solveNum,
						y: subX ? solveNum : subNum
					}
					if (!pairs.includes((p) => this.IsNear(p.x, subX ? subNum : solveNum) && this.IsNear(p.y, subX ? solveNum : subNum)))
					{
						pairs.push(pair);
					}
				}
			}
		}
		// validate all pairs
		for (let pI = 0; pI < pairs.length; pI++)
		{
			const pair = pairs[pI];
			const num = evaluate(expression, { x: pair.x, y: pair.y });
			const num2 = evaluate(expression2, { x: pair.x, y: pair.y });

			if (this.IsNear(this.numberFromExpression(num), 0) && this.IsNear(this.numberFromExpression(num2), 0))
			{
				foundPOEs.push(pair);
			}
		}
		return foundPOEs;
	}

	IsNear(a, b)
	{
		return Math.abs(a - b) < 0.000001;
	}

	AproximateComplex(point)
	{
		if (point.isComplex && this.IsNear(point.im, 0))
		{
			return point.re;
		}
		//TODO probably could look nice with a typeof()
		else if (point.isImaginary && point.isImaginary() && this.IsNear(nerdamer.imagpart(point), 0))
		{
			return nerdamer.realpart(point);
		}
		return point;
	}

	prepareSolutionFromExpression(expression, solution)
	{
		// Pre calculate solutions for x and y (if applies) for the expression
		const includesX = expression.indexOf('x') !==-1;
		const includesY = expression.indexOf('y') !==-1;

		const nExpression = nerdamer(expression)

		// TODO Simplification doesn't work correctly so had to remove it, it might be valuable to use another library as it would make things faster for Nuclinas.
		solution.x = includesX ? nExpression.solveFor('x')/*.map( s => s.simplify())*/ : [];
		solution.y = includesY ? nExpression.solveFor('y')/*.map( s => s.simplify())*/ : [];
	}
//#endregion

//#region UI
	updateXDotExpression(event)
	{
		this.xdotexpression = event.target.value.toLocaleLowerCase();
		this.prepareSolutionFromExpression(this.xdotexpression, this.xSolution);

		this.DeterminePOE(this.xdotexpression, this.xSolution, this.ydotexpression, this.ySolution);
		this.POIs = [];

		this.Draw();
	}

	updateYDotExpression(event)
	{
		this.ydotexpression = event.target.value.toLocaleLowerCase();
		this.prepareSolutionFromExpression(this.ydotexpression, this.ySolution);
		
		this.DeterminePOE(this.ydotexpression, this.ySolution, this.xdotexpression, this.xSolution);
		this.POIs = [];

		this.Draw();
	}

	ShowNuclinas(event)
	{
		this.bShowNuclinas = event.target.checked;
		this.setState( { bShowNuclinas: this.bShowNuclinas });
		this.Draw();
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

	onCanvasMouseDown(event)
	{
		this.clickAnchor = {
			x: event.clientX,
			y: event.clientY
		};
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

	onAppMouseUp(event)
	{
		// check if it was a stationary click
		const acceptableDeltaSq = 5;

		const sqDistance = pow(event.clientX - this.clickAnchor.x, 2) + pow(event.clientY - this.clickAnchor.y, 2)
		if (sqDistance < acceptableDeltaSq)
		{
			this.onCanvasClick(event);
		}

		//drag ended somwhere
		this.dragAnchor.x = -1;
		this.dragAnchor.y = -1;
	}

	onCanvasClick(event)
	{
		const canvasRect = event.target.getBoundingClientRect();
		const point = this.pixelCoordsToPoint(this.axes, event.clientX - canvasRect.left, event.clientY - canvasRect.top);
		this.POIs.push(point);

		this.Draw();
	}

	onAppDrag(event)
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
//#endregion

	render()
	{
		return (
			<div className="App" 
				onMouseMove={(e) => this.onAppDrag(e)}
				onMouseUp={(e) => this.onAppMouseUp(e)}
			>
				
					<div className='container'>
						<div className='inputs'>
							Ingrese las funciones para realizar el gráfico
							<div className='no-lineal'>
								<img src={Llave} width={35}></img>
								<div className='functions'>
									<div className='function'>
										<div className='input_text'>f(x,y)=</div>
										<input className='input' onChange={(e) => this.updateXDotExpression(e)}></input>
									</div>
									<div className='function'>
										<div className='input_text'>g(x,y)=</div>
										<input className='input' onChange={(e) => this.updateYDotExpression(e)}></input>
									</div>
								</div>
							</div>
							<div className='function'>
								<div className='nuctlina'>Ver nuclinas</div>
								<input type="checkbox" onChange={(e) => this.ShowNuclinas(e)} checked={this.state.bShowNuclinas}></input>
							</div>
							Puntos de equilibrio: {this.state.POE}
						</div>
						<div className="canvas-container">
							<canvas ref={this.canvas} className="main-canvas"
								onDragStart={(e) => this.onCanvasDragStart(e)} draggable={true}
								onMouseDown={(e) => this.onCanvasMouseDown(e)}
								onWheel={(e) => this.zoomCanvas(e)}>
							</canvas>
						</div>
					</div>
			</div>
		);
	}
}

export default App;
