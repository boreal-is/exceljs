/* eslint-disable max-classes-per-file */
const colCache = require('../utils/col-cache');

class Column {
  // wrapper around column model, allowing access and manipulation
  constructor(table, column, index) {
    this.table = table;
    this.column = column;
    this.index = index;
  }

  _set(name, value) {
    this.table.cacheState();
    this.column[name] = value;
  }

  /* eslint-disable lines-between-class-members */
  get name() {
    return this.column.name;
  }
  set name(value) {
    this._set('name', value);
  }

  get filterButton() {
    return this.column.filterButton;
  }
  set filterButton(value) {
    this.column.filterButton = value;
  }

  get style() {
    return this.column.style;
  }
  set style(value) {
    this.column.style = value;
  }

  get totalsRowLabel() {
    return this.column.totalsRowLabel;
  }
  set totalsRowLabel(value) {
    this._set('totalsRowLabel', value);
  }

  get totalsRowFunction() {
    return this.column.totalsRowFunction;
  }
  set totalsRowFunction(value) {
    this._set('totalsRowFunction', value);
  }

  get totalsRowResult() {
    return this.column.totalsRowResult;
  }
  set totalsRowResult(value) {
    this._set('totalsRowResult', value);
  }

  get totalsRowFormula() {
    return this.column.totalsRowFormula;
  }
  set totalsRowFormula(value) {
    this._set('totalsRowFormula', value);
  }
  /* eslint-enable lines-between-class-members */
}

class Table {
  constructor(worksheet, table) {
    this.worksheet = worksheet;
    if (table) {
      this.table = table;
      this.table.rowsOptions = [];
      // check things are ok first
      this.validate();

      this.store();
    }
  }

  getFormula(column) {
    // get the correct formula to apply to the totals row
    switch (column.totalsRowFunction) {
      case 'none':
        return null;
      case 'average':
        return `SUBTOTAL(101,${this.table.name}[${column.name}])`;
      case 'countNums':
        return `SUBTOTAL(102,${this.table.name}[${column.name}])`;
      case 'count':
        return `SUBTOTAL(103,${this.table.name}[${column.name}])`;
      case 'max':
        return `SUBTOTAL(104,${this.table.name}[${column.name}])`;
      case 'min':
        return `SUBTOTAL(105,${this.table.name}[${column.name}])`;
      case 'stdDev':
        return `SUBTOTAL(106,${this.table.name}[${column.name}])`;
      case 'var':
        return `SUBTOTAL(107,${this.table.name}[${column.name}])`;
      case 'sum':
        return `SUBTOTAL(109,${this.table.name}[${column.name}])`;
      case 'custom':
        return column.totalsRowFormula;
      default:
        throw new Error(`Invalid Totals Row Function: ${column.totalsRowFunction}`);
    }
  }

  get width() {
    // width of the table
    return this.table.columns.length;
  }

  get height() {
    // height of the table data
    return this.table.rows.length + this.rowsCommitted;
  }

  get filterHeight() {
    // height of the table data plus optional header row
    return this.height + (this.table.headerRow ? 1 : 0);
  }

  get tableHeight() {
    // full height of the table on the sheet
    return this.filterHeight + (this.table.totalsRow ? 1 : 0);
  }

  validate() {
    const {table} = this;
    // set defaults and check is valid
    const assign = (o, name, dflt) => {
      if (o[name] === undefined) {
        o[name] = dflt;
      }
    };
    assign(table, 'headerRow', true);
    assign(table, 'totalsRow', false);

    assign(table, 'style', {});
    assign(table.style, 'theme', 'TableStyleMedium2');
    assign(table.style, 'showFirstColumn', false);
    assign(table.style, 'showLastColumn', false);
    assign(table.style, 'showRowStripes', false);
    assign(table.style, 'showColumnStripes', false);
    assign(table, 'rowsCommitted', 0);

    const assert = (test, message) => {
      if (!test) {
        throw new Error(message);
      }
    };
    assert(table.ref, 'Table must have ref');
    assert(table.columns, 'Table must have column definitions');
    assert(table.rows, 'Table must have row definitions');

    table.tl = colCache.decodeAddress(table.ref);
    const {row, col} = table.tl;
    assert(row > 0, 'Table must be on valid row');
    assert(col > 0, 'Table must be on valid col');

    const {width, filterHeight, tableHeight} = this;

    // autoFilterRef is a range that includes optional headers only
    table.autoFilterRef = colCache.encode(row, col, row + filterHeight - 1, col + width - 1);

    // tableRef is a range that includes optional headers and totals
    table.tableRef = colCache.encode(row, col, row + tableHeight - 1, col + width - 1);

    table.columns.forEach((column, i) => {
      assert(column.name, `Column ${i} must have a name`);
      if (i === 0) {
        assign(column, 'totalsRowLabel', 'Total');
      } else {
        assign(column, 'totalsRowFunction', 'none');
        column.totalsRowFormula = this.getFormula(column);
      }
    });
  }

  store() {
    // where the table needs to store table data, headers, footers in
    // the sheet...
    const assignStyle = (cell, style) => {
      if (style) {
        Object.keys(style).forEach(key => {
          cell[key] = style[key];
        });
      }
    };

    const {worksheet, table} = this;
    const {row, col} = table.tl;
    let count = this.rowsCommitted;
    if (table.headerRow) {
      if (this.rowsCommitted === 0) {
        const r = worksheet.getRow(row + count++);
        table.columns.forEach((column, j) => {
          const {style, name, note} = column;
          const cell = r.getCell(col + j);
          cell.value = name;
          if (note) {
            cell.note = note;
          }
          assignStyle(cell, style);
        });
      } else {
        // rows committed doesn't include the header row
        count++;
      }
    }
    const rows = table.rows.map((data, index) => {
      const r = worksheet.getRow(row + count++);
      data.forEach((value, j) => {
        const cell = r.getCell(col + j);
        cell.value = value;

        assignStyle(cell, table.columns[j].style);
      });
      const rowOptions = table.rowsOptions[index];
      if (rowOptions) {
        Object.keys(rowOptions).forEach(key => (r[key] = rowOptions[key]));
      }
      this.table.rowsCommitted++;
      return r;
    });
    if (this.rowsCommitted > 0 && rows.length > 0) {
      // this will commit all earlier rows as well
      rows[rows.length - 1].commit();
      table.rows = [];
      table.rowsOptions = [];
    }

    if (table.totalsRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        if (j === 0) {
          cell.value = column.totalsRowLabel;
        } else {
          const formula = this.getFormula(column);
          if (formula) {
            cell.value = {
              formula: column.totalsRowFormula,
              result: column.totalsRowResult,
            };
          } else {
            cell.value = null;
          }
        }

        assignStyle(cell, column.style);
      });
    }
  }

  load(worksheet) {
    // where the table will read necessary features from a loaded sheet
    const {table} = this;
    const {row, col} = table.tl;
    let count = 0;
    if (table.headerRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        cell.value = column.name;
      });
    }
    table.rows.forEach(data => {
      const r = worksheet.getRow(row + count++);
      data.forEach((value, j) => {
        const cell = r.getCell(col + j);
        cell.value = value;
      });
    });

    if (table.totalsRow) {
      const r = worksheet.getRow(row + count++);
      table.columns.forEach((column, j) => {
        const cell = r.getCell(col + j);
        if (j === 0) {
          cell.value = column.totalsRowLabel;
        } else {
          const formula = this.getFormula(column);
          if (formula) {
            cell.value = {
              formula: column.totalsRowFormula,
              result: column.totalsRowResult,
            };
          }
        }
      });
    }
  }

  get model() {
    return this.table;
  }

  set model(value) {
    this.table = value;
  }

  // ================================================================
  // TODO: Mutating methods
  cacheState() {
    if (!this._cache) {
      this._cache = {
        ref: this.ref,
        width: this.width,
        tableHeight: this.tableHeight,
      };
    }
  }

  commit() {
    // changes may have been made that might have on-sheet effects
    if (!this._cache) {
      return;
    }

    // check things are ok first
    this.validate();

    if (this.rowsCommitted === 0) {
      const ref = colCache.decodeAddress(this._cache.ref);
      if (this.ref !== this._cache.ref) {
        // wipe out whole table footprint at previous location
        for (let i = 0; i < this._cache.tableHeight; i++) {
          const row = this.worksheet.getRow(ref.row + i);
          for (let j = 0; j < this._cache.width; j++) {
            const cell = row.getCell(ref.col + j);
            cell.value = null;
          }
        }
      } else {
        // clear out below table if it has shrunk
        for (let i = this.tableHeight; i < this._cache.tableHeight; i++) {
          const row = this.worksheet.getRow(ref.row + i);
          for (let j = 0; j < this._cache.width; j++) {
            const cell = row.getCell(ref.col + j);
            cell.value = null;
          }
        }

        // clear out to right of table if it has lost columns
        for (let i = 0; i < this.tableHeight; i++) {
          const row = this.worksheet.getRow(ref.row + i);
          for (let j = this.width; j < this._cache.width; j++) {
            const cell = row.getCell(ref.col + j);
            cell.value = null;
          }
        }
      }
    }

    this.store();
  }

  addRow(values, rowOptions, rowNumber) {
    if (Number.isInteger(rowOptions)) {
      rowNumber = rowOptions;
      rowOptions = undefined;
    }
    // Add a row of data, either insert at rowNumber or append
    if (this.rowsCommitted > 0 && rowNumber !== undefined) {
      rowNumber -= this.rowsCommitted;
      if (rowNumber < 0) {
        throw new Error('Out of bounds: this row has been committed');
      }
    }
    this.cacheState();

    if (rowNumber === undefined) {
      this.table.rows.push(values);
      this.table.rowsOptions.push(rowOptions);
    } else {
      this.table.rows.splice(rowNumber, 0, values);
      this.table.rowsOptions.splice(rowNumber, 0, rowOptions);
    }
  }

  removeRows(rowIndex, count = 1) {
    if (rowIndex < this.rowsCommitted) {
      rowIndex -= this.rowsCommitted;
      if (rowIndex < 0) {
        throw new Error('Out of bounds: this row has been committed');
      }
    }
    // Remove a rows of data
    this.cacheState();
    this.table.rows.splice(rowIndex, count);
    this.table.rowsOptions.splice(rowIndex, count);
  }

  getColumn(colIndex) {
    const column = this.table.columns[colIndex];
    return new Column(this, column, colIndex);
  }

  addColumn(column, values, colIndex) {
    if (this.rowsCommitted > 0) {
      throw new Error('Out of bounds: columns cannot be modified after rows have been committed');
    }
    // Add a new column, including column defn and values
    // Inserts at colNumber or adds to the right
    this.cacheState();

    if (colIndex === undefined) {
      this.table.columns.push(column);
      this.table.rows.forEach((row, i) => {
        row.push(values[i]);
      });
    } else {
      this.table.columns.splice(colIndex, 0, column);
      this.table.rows.forEach((row, i) => {
        row.splice(colIndex, 0, values[i]);
      });
    }
  }

  removeColumns(colIndex, count = 1) {
    if (this.rowsCommitted > 0) {
      throw new Error('Out of bounds: columns cannot be modified after rows have been committed');
    }
    // Remove a column with data
    this.cacheState();

    this.table.columns.splice(colIndex, count);
    this.table.rows.forEach(row => {
      row.splice(colIndex, count);
    });
  }

  _assign(target, prop, value) {
    this.cacheState();
    target[prop] = value;
  }

  /* eslint-disable lines-between-class-members */
  get ref() {
    return this.table.ref;
  }
  set ref(value) {
    if (this.rowsCommitted > 0) {
      throw new Error('Out of bounds: this row has been committed');
    }
    this._assign(this.table, 'ref', value);
  }

  get name() {
    return this.table.name;
  }
  set name(value) {
    this.table.name = value;
  }

  get displayName() {
    return this.table.displyName || this.table.name;
  }
  set displayNamename(value) {
    this.table.displayName = value;
  }

  get headerRow() {
    return this.table.headerRow;
  }
  set headerRow(value) {
    if (this.rowsCommitted > 0) {
      throw new Error('Out of bounds: this row has been committed');
    }
    this._assign(this.table, 'headerRow', value);
  }

  get totalsRow() {
    return this.table.totalsRow;
  }
  set totalsRow(value) {
    this._assign(this.table, 'totalsRow', value);
  }

  get theme() {
    return this.table.style.name;
  }
  set theme(value) {
    this.table.style.name = value;
  }

  get showFirstColumn() {
    return this.table.style.showFirstColumn;
  }
  set showFirstColumn(value) {
    this.table.style.showFirstColumn = value;
  }

  get showLastColumn() {
    return this.table.style.showLastColumn;
  }
  set showLastColumn(value) {
    this.table.style.showLastColumn = value;
  }

  get showRowStripes() {
    return this.table.style.showRowStripes;
  }
  set showRowStripes(value) {
    this.table.style.showRowStripes = value;
  }

  get showColumnStripes() {
    return this.table.style.showColumnStripes;
  }
  set showColumnStripes(value) {
    this.table.style.showColumnStripes = value;
  }

  get rowsCommitted() {
    return this.worksheet.commit ? this.table.rowsCommitted : 0;
  }
  /* eslint-enable lines-between-class-members */
}

module.exports = Table;
