'use strict';

const {
  ipcRenderer
} = require('electron');
const d3 = require('d3');
const fileInput = document.querySelector('#file-input');
const inputButton = document.querySelector('#input-button');
const margin = 20;
const smPadding = 5;
const stdBoxHeight = 40;
const stdBoxWidth = 120;
const smFontSize = 10;
const lgFontSize = 14;
const pathXCurve = 100;
const pathYCurve = 20;
const animationDelayMs = 500;
const pathLogScale = d3.scaleLog().range([1, 10]);
let sheetLevelShown = false;

inputButton.addEventListener('click', () => {
  let pathName = fileInput.files[0].path;

  async function retrieveData(pathName) {
    if (!(pathName)) {
      return;
    }
    let promise = new Promise(resolve => {
      ipcRenderer.send('async-file-path', pathName);
      ipcRenderer.on('async-reply', (event, result) => {
        resolve(result);
      });
    })
    let readyData = await promise;
    return readyData;
  }

  retrieveData(pathName)
    .then(d => {
      return buildTreeStructure(d);
    })
  // .then(e => buildMap(e));
});

let treeData = {
  name: 'primaryRoot',
  type: 'root',
  children: []
};
let allLinks = [];
let bookNodeRegister = [];
let sheetNodeRegister = [];

function buildTreeStructure(linkCnts) {
  let latest;
  let bookIndex, sheetIndex;
  let prevMax, prevMin;
  let cntMax, cntMin;

  linkCnts.forEach(line => {
    let hasHash, isLink;
    if (/^#/.test(line)) {
      hasHash = true;
      isLink = /^#\+/.test(line);
    }
    if (!hasHash) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (match) {
        bookIndex = +match[1];
        sheetIndex = -1;
        let pathSections = match[2].split('/');
        mergeFrom(treeData, pathSections, bookIndex);
      } else {
        let sheetName = line.trim();
        sheetIndex++;
        latest.children.push({
          name: sheetName,
          type: 'sheet',
          ix: sheetIndex,
          children: null
        });
      }
    } else if (isLink) {
      let args = line.split(/\s+/);
      args.shift();

      let linkObject = {};

      if (args[0] == 's') {
        linkObject.bookixa = +args[1];
        linkObject.sheetixa = +args[2];
        linkObject.bookixb = +args[3];
        linkObject.sheetixb = +args[4];
        linkObject.cnt = +args[5];
        linkObject.type = 'sheet';
      } else {
        linkObject.bookixa = +args[1];
        linkObject.bookixb = +args[2];
        linkObject.cnt = +args[3];
        linkObject.type = 'book';
      }
      allLinks.push(linkObject);
      cntMax = d3.max([linkObject.cnt, prevMax]);
      cntMin = d3.min([linkObject.cnt, prevMin]);
      prevMax = cntMax;
      prevMin = cntMin;
    }
  });
  pathLogScale.domain([cntMin, cntMax]);
  // return allLinks;
  buildMap();

  function mergeFrom(curNode, pathRest, bookIx) {
    while (pathRest.length) {
      let folder = pathRest.shift();
      let exists = false;
      curNode.children.forEach((ch) => {
        if (ch.name == folder) {
          mergeFrom(ch, pathRest, bookIx);
          exists = true;
        }
      });
      if (!(exists)) {
        let type = folder.split('.').includes('xlsx') ? 'book' : 'folder';

        let newNode = {
          name: folder,
          type: type,
          children: []
        };
        if (type == 'book') {
          newNode['ix'] = bookIx;
        }
        latest = newNode;
        curNode.children.push(newNode);
        mergeFrom(newNode, pathRest, bookIx);
      }
    }
  }

}

async function buildMap() {
  function Tree(treeData) {
    this.treeData = treeData;
    this.treeRoot = {};
    this.currentEdges = [];
    this.nodeHash = {};
    this.edges = allLinks;

    this.createPrimaryRoot = function (sheets) {
      this.treeRoot = d3.hierarchy(this.treeData, node => node.children);
      this.treeRoot.descendants().forEach((d, i) => {
        d._children = d.children;
      })

      this.treeRoot.descendants().forEach(node => {
        if (node.data.type == 'book') {
          bookNodeRegister[node.data.ix] = node;
        }
      })

      this.treeRoot.descendants().forEach(node => {
        if (node.data.type == 'sheet') {
          if (typeof sheetNodeRegister[node.parent.data.ix] === 'undefined') {
            sheetNodeRegister[node.parent.data.ix] = [];
          }
          sheetNodeRegister[node.parent.data.ix][node.data.ix] = node;
        }
      });
      this.createEdges();
    }

    this.calculateShape = function (h, w, sheets) {
        this.treeRoot.descendants().forEach((node) => {
          node.boxHeight = stdBoxHeight;
          node.boxWidth = stdBoxWidth;


          if (node.data.type == 'book') {
            if (sheets) {
              if (node._children) {
                node.children = node._children;
              }
            } else {
              node.children = null;
            }
          }
        });

        const treeDiagram = d3.cluster().size([h, w])(this.treeRoot);

        this.treeRoot.descendants().forEach((node) => {
          if (node.data.type == 'sheet') {
            node.y = node.parent.y + margin;
            node.fontSize = smFontSize;
          }
          if (node.data.type == 'book') {
            node.fontSize = lgFontSize;
            if (node.children) {
              if (sheets) {
                node.boxHeight = node.children[node.children.length - 1].x - node.children[0].x + stdBoxHeight + 2 * margin;
                node.boxWidth = stdBoxWidth + margin * 2;
              }
            }
          }
        })
      },

      this.createEdges = function () {
        allLinks.forEach((linkObj) => {
          if (linkObj.type == 'book') {
            linkObj.booka = bookNodeRegister[linkObj.bookixa];
            linkObj.bookb = bookNodeRegister[linkObj.bookixb];
          } else {
            linkObj.sheeta = sheetNodeRegister[linkObj.bookixa][linkObj.sheetixa];
            linkObj.sheetb = sheetNodeRegister[linkObj.bookixb][linkObj.sheetixb];
            linkObj.cnt = parseInt(linkObj.cnt);
            this.edges.push(linkObj);
          }
        })
      }
  }

  const tree = new Tree(treeData);
  tree.createPrimaryRoot(sheetLevelShown);

  const treeDiv = d3.select('#treeDiagram');
  const tSvg = treeDiv.select('svg');
  let tG = tSvg.append('g');
  // const colors = d3.schemePastel2;
  // const nodeTypes = ['root', 'folder', 'book', 'sheet', 'cell'];
  // const colorScale = d3.scaleOrdinal().domain(nodeTypes).range(colors).unknown('#333');
  const t = tSvg.transition().duration(1000);

  const toolDiv = d3.select('body')
    .append('div')
    .attr('class', 'toolTip')
    .style('opacity', 0);

  const menuDiv = d3.select('body')
    .append('div')
    .attr('class', 'menu');
  const menu = d3.select('.menu');
  const button = menu.append('div');
  button.append('button')
    .text('switch view');

  // TODO: fix tooltop, look at electron event listener
  const showTooltip = function (d) {
    toolDiv
      .transition().duration(200)
      .style('opacity', 0.9);
    toolDiv.html('name: ' + d.data.name + '<br>' + 'type: ' + d.data.type)
      .style('left', (d3.event.pageX) + "px")
      .style("top", (d3.event.pageY - 28) + "px");
  }

  function hideTooltip(d) {
    toolDiv
      .transition().duration(100)
      .style("opacity", 0);
  }

  window.addEventListener("resize", redraw);
  redraw();

  function redraw() {
    const treeDivWidth = treeDiv.node().getBoundingClientRect().width - 2 * margin;
    const treeGraphHeight = treeDiv.node().getBoundingClientRect().height - 2 * margin;
    const treeGraphWidth = treeDivWidth - 2 * margin - 2 * stdBoxWidth;
    tG.attr("transform", `translate(${0.5 * stdBoxWidth + margin}, ${margin})`)

    animateShape();
    button.on('click', function removeOrAddLevel(d) {
      sheetLevelShown = !sheetLevelShown;
      animateShape()
    });

    function animateShape() {
      d3.select('.sheetStatus').text(sheetLevelShown);
      tree.calculateShape(treeGraphHeight, treeGraphWidth, sheetLevelShown);


      let dataBoundNodes = tG.selectAll('.gNode')
        .data(tree.treeRoot.descendants());
      dataBoundNodes.exit().remove();

      let dataBoundLinks = tG.selectAll('.gLink')
        .data(tree.treeRoot.links());
      dataBoundLinks.exit().remove();

      let dataBoundEdges = tG.selectAll('.gEdge')
        .data(tree.edges)
      dataBoundEdges.exit().remove();

      let gNodes = dataBoundNodes
        .enter()
        .append('g')
        .attr('class', 'gNode');
      gNodes
        .on('mouseover', showTooltip)
        .on('mouseout', hideTooltip)
        .append('rect')
        .attr('class', 'treeBox')
        .attr('fill', 'grey')
        .style('opacity', 0.3)
        .style('stroke', d => 'grey');
      gNodes.append('text');
      gNodes.append('clipPath')
        .attr('id', d => `clip${d.data.name}`)
        .append('rect');

      let gLinks = dataBoundLinks
        .enter()
        .append('g')
        .attr('class', 'gLink')
      gLinks
        .append('line')
        .style('stroke', '#ccc');

      let gEdges = dataBoundEdges
        .enter()
        .append('g')
        .attr('class', 'gEdge');

      gEdges
        .append('path')
        .attr('class', 'inactive')
        .style('fill', 'none')
        .style('opacity', 0.25)

      let mergedNodes = gNodes.merge(dataBoundNodes);
      let mergedLinks = gLinks.merge(dataBoundLinks);
      let mergedEdges = gEdges.merge(dataBoundEdges);

      mergedNodes
        .attr('transform', d => `translate(${d.y}, ${d.x})`)
      mergedNodes
        .select('rect')
        .style('stroke', d => 'black')
        .attr('width', d => d.boxWidth)
        .attr('height', d => d.boxHeight)
        .attr('y', d => -0.5 * d.boxHeight);
      mergedNodes
        .select('clipPath')
        .select('rect')
        .attr('width', d => d.boxWidth - 2 * smPadding)
        .attr('height', d => d.boxHeight - 2 * smPadding)
        .attr('y', d => -0.5 * d.boxHeight);
      mergedNodes
        .select('text')
        .attr('clip-path', d => d.data.type !== 'book' ? `url(#clip${d.data.name})` : 0)
        .text(d => (d.data.name))
        .attr('x', smPadding)
        .attr('y', d => d.data.type == 'book' && sheetLevelShown ?
          -0.5 * d.boxHeight - smPadding : 0)
        .attr('font-size', d => d.fontSize);

      mergedLinks
        .select('line')
        .attr("x1", d => d.source.data.type === 'book' ? 0 : d.source.y + stdBoxWidth)
        .attr("y1", d => d.source.data.type === 'book' ? 0 : d.source.x)
        .attr("x2", d => d.source.data.type === 'book' ? 0 : d.target.y)
        .attr("y2", d => d.source.data.type === 'book' ? 0 : d.target.x);

      mergedEdges
        .select('path')
        .style('stroke', 'red')
        .style('stroke-width', d => pathLogScale(d.cnt))
        .style('opacity', 0.3)
        .attr("d", function (d) {
          let from, to;

          if (d.type == 'sheet') {
            from = 'sheeta';
            to = 'sheetb';
          } else {
            from = 'booka';
            to = 'bookb';
            if (d[from] === d[to]) {
              return;
            }
          }

          return `M ${d[to].y + d[to].boxWidth } ${d[to].x} 
                    C ${d[to].y + d[to].boxWidth + 100  } ${d[to].x }, 
                      ${d[from].y - 100}                  ${d[from].x  }, 
                      ${d[from].y } ${d[from].x}`;
        });

      mergedEdges
        .attr('visibility', 'hidden')
        .attr('visibility', d => {
          if (d.type == 'book') {
            if (sheetLevelShown) {
              return 'hidden';

            } else {
              return 'visible';
            }
          }
          if (d.type == 'sheet') {
            if (sheetLevelShown) {
              return 'visible';
            } else {
              return 'hidden';
            }
          }
        });
    }
  }
  // }
}