const {EventEmitter} = require('events');
const fs = require('fs');

const WorkbookReader = require('../../../lib/stream/xlsx/workbook-reader');

describe('WorkbookReader', () => {
  describe('#flushQueue', () => {
    it('closes an unconsumed temporary worksheet stream before cleanup', async () => {
      const originalCreateReadStream = fs.createReadStream;
      const fileStream = new EventEmitter();
      let cleanupCalledAfterClose = false;

      fileStream.closed = false;
      fileStream.destroy = () => {
        setImmediate(() => {
          fileStream.closed = true;
          fileStream.emit('close');
        });
      };
      fs.createReadStream = () => fileStream;

      try {
        const workbookReader = new WorkbookReader();
        workbookReader.waitingWorksheets.push({
          sheetNo: 1,
          path: '/tmp/worksheet.xml',
          tempFileCleanupCallback: () => {
            cleanupCalledAfterClose = fileStream.closed;
          },
        });

        for await (const event of workbookReader.flushQueue(true)) {
          expect(event.eventType).to.equal('worksheet');
        }

        expect(cleanupCalledAfterClose).to.equal(true);
      } finally {
        fs.createReadStream = originalCreateReadStream;
      }
    });
  });
});
