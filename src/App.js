import './App.css';
import React, { Component } from 'react';
import { acos, all, create, dot, evaluate, index, norm, pi, pow, round, sqrt } from 'mathjs'
import 'math-expression-evaluator'
import nerdamer from "nerdamer/all.js"
import Llave from './soporte-abierto.png'

class App extends Component {

	incrementalDivision = 3;

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
	bShowEjes = true;

	axes = { };

	/** Points of interest to draw lines from. in numeric coordinates */
	POIs = [];
	POE = [];
	POEInfo = [];

	Jacobian;

	selectedIndex = -1;

//#endregion

//#region Constructor and Setup
	constructor()
	{
		super();
		this.canvas = React.createRef(null);

		this.state = {
			bShowNuclinas: true,
			bShowEjes: true,
			POE: [],
			selectedIndex: -1
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

		let expressions = {
			xdotexpression: this.xdotexpression,
			ydotexpression: this.ydotexpression
		}

		let solutions = {
			xSolution: this.xSolution,
			ySolution: this.ySolution
		}

		// let POEList = this.POE;

		if (this.selectedIndex != -1)
		{
			this.generatePOEInfo(this.selectedIndex);

			expressions.xdotexpression = this.POEInfo[this.selectedIndex].xdotexpression;
			expressions.ydotexpression = this.POEInfo[this.selectedIndex].ydotexpression;

			solutions.xSolution = this.POEInfo[this.selectedIndex].xSolution;
			solutions.ySolution = this.POEInfo[this.selectedIndex].ySolution;

			// POEList = [ this.POE[this.selectedIndex] ];
		}

		if (this.bShowEjes)
		{
			this.drawAxes(ctx, axes);
		}

		this.drawFlowLines(ctx, axes, expressions);

		if (this.bShowNuclinas)
		{
			this.drawNuclinas(ctx, axes, expressions, solutions);
		}

		for (let i = 0; i < this.POIs.length; ++i)
		{
			const POI = this.POIs[i];
			this.drawFullFlow(ctx, axes, POI, expressions);
		}

		if (this.selectedIndex == -1)
		{
			this.DrawPOE(ctx, axes, this.POE, this.POEInfo, { autoVectorLength: 0.25 });
		}
		else
		{
			this.DrawPOE(ctx, axes, [{ x: 0, y: 0}], [ this.POEInfo[this.selectedIndex] ], { autoVectorLength: 0.25 });
		}
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
	
	drawFlowLines(ctx, axes, expressions)
	{
		const flowlineCount = 20;
		const flowlineSteps = 20;

		const spaceInBetweenX = ctx.canvas.width / (flowlineCount - 3);
		const spaceInBetweenY = ctx.canvas.height / (flowlineCount - 3);

		if (expressions.xdotexpression !=="" && expressions.ydotexpression !=="")
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

					this.drawFlowLine(ctx, axes, point, { flowlineSteps: flowlineSteps }, expressions)
				}
			}
			ctx.stroke();
		}
	}

	drawFullFlow(ctx, axes, POI, expressions)
	{
		ctx.beginPath();
		ctx.strokeStyle = "rgb(0,0,0)";
		ctx.lineWidth = 2;
		this.drawFlowLine(ctx, axes, POI, { checkOOB: true, flowlineStepLength: 20  }, expressions);
		this.drawFlowLine(ctx, axes, POI, { checkOOB: true, flowlineStepLength: 20, inverted: true }, expressions);
		ctx.stroke();
		ctx.lineWidth = 1;
	}

	drawFlowLine(ctx, axes, point, params, expressions)
	{
		point = Object.assign({}, point);

		let fullFlow = false;

		if (!params.flowlineSteps)
		{
			params.flowlineSteps = 500;
			fullFlow = true;
		}
		if (!params.inverted)
		{
			params.inverted = false;
		}
		if (!params.flowlineStepLength)
		{
			params.flowlineStepLength = 1;
		}
		if (!params.checkOOB)
		{
			params.checkOOB = false;
		}

		const flowlineStepLength = params.flowlineStepLength / (this.math.pow(this.scale / 60, 10/12) * 300);
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
		let skipNextLine = false, initialPointDrawn = false;

		for (let step = 0; step < params.flowlineSteps; step++)
		{
			let dir = this.evaluateExpressions(expressions.xdotexpression, expressions.ydotexpression, point);

			if (params.inverted)
			{
				dir = {
					x: -dir.x,
					y: -dir.y
				}
			}

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
						point.x -= pDir.x * flowlineStepLength * flowlineStepLengthMod;
						point.y -= pDir.y * flowlineStepLength * flowlineStepLengthMod;

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
			
			if (!initialPointDrawn)
			{
				screenPos = this.pointToPixel(axes, point);
				ctx.moveTo(screenPos.x, screenPos.y);
				initialPointDrawn = true;
			}

			point.x += dir.x * flowlineStepLength * flowlineStepLengthMod;
			point.y += dir.y * flowlineStepLength * flowlineStepLengthMod;

			screenPos = this.pointToPixel(axes, point);

			// ctx.lineTo(screenPos.x, screenPos.y);
			// we draw the line at the very beginning of the next iteration to avoid going over

			// draw arrow tip
			if (step === params.flowlineSteps-1 && !params.inverted && !fullFlow)
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

	drawNuclinas(ctx, axes, expressions, solutions)
	{
		if (expressions.xdotexpression === "" || expressions.ydotexpression === "")
		{
			return;
		}
		
		// Nuclina X
		ctx.lineWidth = 2;
		ctx.strokeStyle = "rgb(200,0,150)";
		this.drawNuclinaInDirection(ctx, axes, solutions.xSolution.x, true);
		this.drawNuclinaInDirection(ctx, axes, solutions.xSolution.y, false);
		
		// Nuclina Y
		ctx.strokeStyle = "rgb(150,0,200)";
		this.drawNuclinaInDirection(ctx, axes, solutions.ySolution.x, true);
		this.drawNuclinaInDirection(ctx, axes, solutions.ySolution.y, false);

		ctx.stroke();
		ctx.lineWidth = 1;
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
				const maxDistance = increment * this.incrementalDivision * Math.min(Math.max(1, this.math.abs(value*value/4)), limit/4);

				if (pCurrent !== null && distance < maxDistance)
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

	DrawPOE(ctx, axes, poeList, poeInfoList, params)
	{
		const radius = 6;

		const ignoreInfo = poeList.length != poeInfoList.length;
		if (ignoreInfo)
		{
			console.warn("Ignoring POE Info as it doesn't match 1 to 1 with the POE list");
		}

		for (let i = 0; i < poeList.length; i++)
		{
			const POE = poeList[i];
			const POEInfo = poeInfoList[i];
			const pixelPOE = this.pointToPixel(axes, POE);

			if (!ignoreInfo)
			{
				this.DrawPOEAutoVectors(ctx, axes, POE, POEInfo, params);
			}

			ctx.beginPath();
			ctx.fillStyle = "#00D0D0";
			ctx.strokeStyle = "rgb(0,0,0)";
			ctx.arc(pixelPOE.x, pixelPOE.y, radius, 0, 2 * this.math.pi);
			ctx.fill();
			ctx.stroke();
		}
	}

	DrawPOEAutoVectors(ctx, axes, poe, info, params)
	{
		const parabola = info.p * info.p / 4;

		console.log(info.p);
		console.log(info.q);
		console.log(parabola);

		if (info.q < 0 || ( info.q < parabola && info.q > 0))
		{
			this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[0], info.autoValues[0], params);
			this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[1], info.autoValues[1], params);
		}
		else if (info.p != 0 && info.q == 0)
		{
			const params2 = Object.assign({}, params);
			params2.defaultColor = info.p > 0 ? "rgb(250,0,0)" : "rgb(0,120,180)"; 
			if (info.p > 0) // autovalue1 == 0
			{
				this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[0], info.autoValues[0], params2);
				this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[1], info.autoValues[1], params);	
			}
			else // autovalue2 == 0
			{
				this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[0], info.autoValues[0], params);
				this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[1], info.autoValues[1], params2);	
			}
		}
		else if (info.p == 0 && info.q == 0)
		{
			const params2 = Object.assign({}, params);
			params2.defaultColor = "rgb(250,0,0)"; 
			this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[0], info.autoValues[0], params2);
		}
		else if (info.q == parabola)
		{
			this.DrawPOEAutoVectors_Internal(ctx, axes, poe, info.autoVectors[0], info.autoValues[0], params);
		}
		else
		{
			console.warn("Unhandled (p;q) situation");
		}
	}

	DrawPOEAutoVectors_Internal(ctx, axes, poe, vector, value, params)
	{
		ctx.beginPath();
		ctx.lineWidth = axes.scale > 500 ? 2 : 1;

		if (!params) { params = {} };

		const useParamLength = params.autoVectorLength != undefined;
		
		const closeToPixelPOE = (mult) => {
			const a = mult * 6/axes.scale;
			return this.pointToPixel(axes, { x: poe.x + vector[0] * a, y: poe.y + vector[1] * a });
		}

		if (useParamLength)
		{
			const beginPoint = this.pointToPixel(axes, {
				x: poe.x + vector[0] * params.autoVectorLength,
				y: poe.y + vector[1] * params.autoVectorLength
			});
			const endPoint = this.pointToPixel(axes, {
				x: poe.x - vector[0] * params.autoVectorLength,
				y: poe.y - vector[1] * params.autoVectorLength
			});

			if (value > 0)
			{
				ctx.strokeStyle = "rgb(250,0,0)";
				this.drawTip(ctx, beginPoint, endPoint, { tipLength: 10 });
				this.drawTip(ctx, endPoint, beginPoint, { tipLength: 10 });
			}
			else if (value < 0)
			{
				ctx.strokeStyle = "rgb(0,120,180)";
				this.drawTip(ctx, beginPoint, closeToPixelPOE(1), { tipLength: 10 });
				this.drawTip(ctx, endPoint, closeToPixelPOE(-1), { tipLength: 10 });
			}
			else if (params.defaultColor != undefined)
			{
				ctx.strokeStyle = params.defaultColor;
				this.drawTip(ctx, beginPoint, endPoint, { tipLength: 10 }, 2);
				this.drawTip(ctx, endPoint, beginPoint, { tipLength: 10 }, 2);
			}
			else
			{
				console.warn("Attempting to draw autovector for autovalue = 0")
			}

			 ctx.moveTo(beginPoint.x, beginPoint.y);
			 ctx.lineTo(endPoint.x, endPoint.y);
		}
		
		ctx.stroke();
		ctx.lineWidth = 1;
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

	evaluateExpressions(xExpression, yExpression, point)
	{
		try {
			var x = evaluate(xExpression, {x: point.x, y: point.y});
			var y = evaluate(yExpression, {x: point.x, y: point.y});
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

	/** Moves and draws an arrow tip. doesn't perform a stroke. Does not draw a line between from an to. */
	drawTip(ctx, from, to, params, open = 6) {
		const direction = {
			x: to.x - from.x,
			y: to.y - from.y
		}
		const angle = Math.atan2(direction.y, direction.x);
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x - params.tipLength * Math.cos(angle - Math.PI / open), to.y - params.tipLength * Math.sin(angle - Math.PI / open));
		ctx.moveTo(to.x, to.y);
		ctx.lineTo(to.x - params.tipLength * Math.cos(angle + Math.PI / open), to.y - params.tipLength * Math.sin(angle + Math.PI / open));
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
		this.POEInfo = [];
		
		this.selectedIndex = -1;
		this.setState({
			selectedIndex: -1
		});

		{
			const includesX = expression.indexOf('x') !==-1;
			const includesY = expression.indexOf('y') !==-1;

			let totalFound = [];

			let exit = false;

			//TODO cuidado con el caso en que f(x) = g(x), van a tirar las raices junto con y = 0
			// Both have x
			if (includesX && solutionFor2.x.length > 0)
			{
				const foundPOEs1 = this.DeterminePOE_Internal(expression, expression2, solutionFor2, true);
				const foundPOEs2 = this.DeterminePOE_Internal(expression2, expression, solutionFor1, true);
				totalFound = foundPOEs1.concat(foundPOEs2);
				exit = true;
			}

			// Both have y
			if (includesY && solutionFor2.y.length > 0)
			{
				const foundPOEs1 = this.DeterminePOE_Internal(expression, expression2, solutionFor2, false);
				const foundPOEs2 = this.DeterminePOE_Internal(expression2, expression, solutionFor1, false);
				totalFound = totalFound.concat(foundPOEs1).concat(foundPOEs2);
				exit = true;
			}

			for (let i = 0; i < totalFound.length; i++)
			{
				const poe = totalFound[i];
				if (this.POE.findIndex((p) => this.IsNear(p.x, poe.x) && this.IsNear(p.y, poe.y)) == -1)
				{
					this.POE.push(poe);
				}
			}

			if (this.POE.length > 0)
			{
				this.onPOESet();
			}
			if (exit)
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

			if (this.POE.length > 0)
			{
				this.onPOESet();
				return;
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
				console.error(e);
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
				if (solveValues.findIndex((s) => s.toString() === solveS.toString()) == -1)
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
					if (pairs.findIndex((p) => this.IsNear(p.x, subX ? subNum : solveNum) && this.IsNear(p.y, subX ? solveNum : subNum)) == -1)
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

	onPOESet()
	{
		this.POEInfo.length = this.POE.length;
		
		this.setState({
			POE: this.POE
		})
	}

	generatePOEInfo(index)
	{
		if (this.POEInfo.length <= index)
		{
			console.warn("Invalid index for POE");
			return;
		}

		if (this.POEInfo[index] == undefined)
		{
			this.generatePOEInfo_Internal(index);
		}
	}

	generatePOEInfo_Internal(index)
	{
		if (this.Jacobian == undefined)
		{
			console.warn("Unset Jacobian");
			return;
		}

		const poe = this.POE[index];

		const travelToPoint = (exp) => {
			return this.AproximateComplex(this.math.evaluate(exp.sub('x', poe.x).sub('y', poe.y).toString()));
		}

		const linealizedMatrix = [
			[
				travelToPoint(this.Jacobian[0][0]),
				travelToPoint(this.Jacobian[0][1])
			],
			[
				travelToPoint(this.Jacobian[1][0]),
				travelToPoint(this.Jacobian[1][1])
			]
		];

		const homogeneo = linealizedMatrix[0][1] == 0 && linealizedMatrix[1][0] == 0;

		const p = linealizedMatrix[0][0] + linealizedMatrix[1][1], q = (linealizedMatrix[0][0]*linealizedMatrix[1][1])-(linealizedMatrix[0][1]*linealizedMatrix[1][0]);

		const characteristicEqn = nerdamer("x^2 -" + p + "*x +" + q);

		let autoValues = homogeneo ? [ linealizedMatrix[0][0], linealizedMatrix[1][1] ] : characteristicEqn.solveFor('x');
		let autoValuesAreEqual = false;

		if (autoValues.length == 1)
		{
			autoValues.push(autoValues[0]);
			autoValuesAreEqual = true;
		}
		else if (autoValues.length == 0)
		{
			console.warn("not autovalue found?");
		}
		autoValues.sort();

		autoValues[0] = this.AproximateComplex(this.math.evaluate(autoValues[0].toString()));
		autoValues[1] = this.AproximateComplex(this.math.evaluate(autoValues[1].toString()));

		const subspaceMatrix1 = [
			[linealizedMatrix[0][0] - autoValues[0], linealizedMatrix[0][1]],
			[linealizedMatrix[1][0], linealizedMatrix[1][1] - autoValues[0]]
		];
		const subspaceMatrix2 = [
			[linealizedMatrix[0][0] - autoValues[1], linealizedMatrix[0][1]],
			[linealizedMatrix[1][0], linealizedMatrix[1][1] - autoValues[1]]
		];

		let rowIndex = -1;
		if (subspaceMatrix1[0][0] != 0 || subspaceMatrix1[0][1] != 0)
		{
			rowIndex = 0;
		}
		else if (subspaceMatrix1[1][0] != 0 || subspaceMatrix1[1][1] != 0)
		{
			rowIndex = 1;
		}

		if (rowIndex != -1)
		{
			nerdamer.setVar('av1', 'vector(' + subspaceMatrix1[rowIndex][1] + ',' + (-subspaceMatrix1[rowIndex][0]) + ')')
			nerdamer.setVar('av1', 'av1/(sqrt(vecget(av1,0)^2+vecget(av1,1)^2))');
		}
		
		const autoVector1 = homogeneo ? [1, 0] : (rowIndex != -1 ? [
			this.AproximateComplex(this.math.evaluate(nerdamer('vecget(av1, 0)').evaluate().toString())),
			this.AproximateComplex(this.math.evaluate(nerdamer('vecget(av1, 1)').evaluate().toString())),
		] : [0, 0]);

		rowIndex = -1;
		if (subspaceMatrix2[0][0] != 0 || subspaceMatrix2[0][1] != 0)
		{
			rowIndex = 0;
		}
		else if (subspaceMatrix2[1][0] != 0 || subspaceMatrix2[1][1] != 0)
		{
			rowIndex = 1;
		}

		if (rowIndex != -1)
		{
			nerdamer.setVar('av2', 'vector(' + subspaceMatrix2[rowIndex][1] + ',' + (-subspaceMatrix2[rowIndex][0]) + ')')
			nerdamer.setVar('av2', 'av2/(sqrt(vecget(av2,0)^2+vecget(av2,1)^2))');		
		}
		const autoVector2 = homogeneo ? [0, 1] : (rowIndex != -1 ? [
			this.AproximateComplex(this.math.evaluate(nerdamer('vecget(av2, 0)').evaluate().toString())),
			this.AproximateComplex(this.math.evaluate(nerdamer('vecget(av2, 1)').evaluate().toString())),
		] : [0, 0]);
		
		nerdamer.setVar('av1', 'delete');
		nerdamer.setVar('av2', 'delete');

		//autoVector verification
		const v1Verif = (subspaceMatrix1[1][0] * autoVector1[0] + subspaceMatrix1[1][1] * autoVector1[1]);
		const v2Verif = (subspaceMatrix2[1][0] * autoVector2[0] + subspaceMatrix2[1][1] * autoVector2[1]);

		if (!this.IsNear(v1Verif, 0) || !this.IsNear(v2Verif, 0))
		{
			console.warn("incorrec autovector calculation");
		}

		const xdotexpression = linealizedMatrix[0][0] + "*x + " + linealizedMatrix[0][1] + "*y";
		const ydotexpression = linealizedMatrix[1][0] + "*x + " + linealizedMatrix[1][1] + "*y";

		let xSolution = {
			x: [],
			y: []
		}, ySolution = {
			x: [],
			y: []
		};
		this.prepareSolutionFromExpression(xdotexpression, xSolution);
		this.prepareSolutionFromExpression(ydotexpression, ySolution);

		this.POEInfo[index] = 
		{
			linealizedMatrix: linealizedMatrix,
			p: p,
			q: q,
			xdotexpression: xdotexpression,
			ydotexpression: ydotexpression,
			xSolution: xSolution,
			ySolution: ySolution,
			autoValuesAreEqual: autoValuesAreEqual,
			autoValues: autoValues,
			autoVectors: [autoVector1, autoVector2]
		}
	}

	UpdateJacobian()
	{
		const F = nerdamer(this.xdotexpression);
		const G = nerdamer(this.ydotexpression);

		const FdX = nerdamer.diff(F, 'x');
		const FdY = nerdamer.diff(F, 'y');
		const GdX = nerdamer.diff(G, 'x');
		const GdY = nerdamer.diff(G, 'y');
		
		this.Jacobian = [
			[FdX, FdY],
			[GdX, GdY]
		];
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

		try {
			nerdamer(this.xdotexpression);
		}
		catch (error) {
			if (error.name = 'ParseError')
			{
				return;
			}
		}

		this.prepareSolutionFromExpression(this.xdotexpression, this.xSolution);

		this.onExpressionUpdated();
	}

	updateYDotExpression(event)
	{
		this.ydotexpression = event.target.value.toLocaleLowerCase();

		try {
			nerdamer(this.ydotexpression);
		}
		catch (error) {
			if (error.name = 'ParseError')
			{
				return;
			}
		}

		this.prepareSolutionFromExpression(this.ydotexpression, this.ySolution);

		this.onExpressionUpdated();
	}

	onExpressionUpdated()
	{
		this.DeterminePOE(this.xdotexpression, this.xSolution, this.ydotexpression, this.ySolution);
		this.POIs = [];
		
		this.UpdateJacobian();
		for (let i = 0; i < this.POEInfo.length; i++)
		{
			this.generatePOEInfo(i);
		}

		this.Draw();
	}

	ShowNuclinas(event)
	{
		this.bShowNuclinas = event.target.checked;
		this.setState( { bShowNuclinas: this.bShowNuclinas });
		this.Draw();
	}

	ShowEjes(event)
	{
		this.bShowEjes = event.target.checked;
		this.setState( { bShowEjes: this.bShowEjes });
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

	SelectPOE(index)
	{
		let newIndex = index;
		if (index == this.selectedIndex)
		{
			newIndex = -1;
		}

		this.selectedIndex = newIndex;
		this.setState({
			selectedIndex: newIndex
		});

		this.POIs = [];

		this.Draw();
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
							<div className='nuctlina'>Ejes </div>
							<input type="checkbox" className='checkbox' onChange={(e) => this.ShowEjes(e)} checked={this.state.bShowEjes}></input>
							
						</div>
						<div className='function'>
							<div className='nuctlina'>Nuclinas </div>
							<input type="checkbox" className='checkbox' onChange={(e) => this.ShowNuclinas(e)} checked={this.state.bShowNuclinas}></input>
						</div>
						Puntos de equilibrio: 
						<div>
							{
								this.state.POE.map(
									(POE, index) =>
									{
										const selected = this.state.selectedIndex == index;
										const _class = selected ? "poe-selected" : "poe"
										return (
											<div className={_class} onClick={(e) => this.SelectPOE(index)}>
												(x: {round(POE.x, 2)}; y: {round(POE.y, 2)})
											</div>
										)
									}
								)
							}
						</div>
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
