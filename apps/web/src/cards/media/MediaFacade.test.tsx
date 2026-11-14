import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as AudioModule from './AudioPlayer';
import * as ViewerModule from './PageViewer';
import * as VideoModule from './VideoPlayer';
import { MediaFacade } from './MediaFacade';
import { loadMediaModule, resetMediaModules } from './load-media-module';
import { releaseActiveMedia } from './use-active-media';

const video = (id: string) => ({
  kind: 'video' as const,
  publicId: `gobbit/items/d/${id}`,
  width: 720,
  height: 1280,
  durationMs: 65_000,
});

beforeEach(() => {
  resetMediaModules({
    video: async () => VideoModule,
    audio: async () => AudioModule,
    viewer: async () => ViewerModule,
  });
  HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause() {};
  HTMLMediaElement.prototype.load = function load() {};
});

afterEach(() => {
  act(() => releaseActiveMedia());
  resetMediaModules();
});

describe('MediaFacade (D400)', () => {
  it('renders 20 video cards with no media element and their badges', () => {
    const { container } = render(
      <>
        {Array.from({ length: 20 }, (_, i) => (
          <MediaFacade
            key={i}
            itemId={`i${i}`}
            title="Boiler"
            payload={video(`v${i}`)}
            cloudName="demo"
          />
        ))}
      </>,
    );
    expect(container.querySelectorAll('video, audio')).toHaveLength(0);
    expect(screen.getAllByText('1:05')).toHaveLength(20);
    const still = container.querySelector('img.cloud-image__img');
    expect(still?.getAttribute('src')).toContain('/video/upload/so_auto,');
  });

  it('mounts the player on Play, and only one plays at a time', async () => {
    await loadMediaModule('video');
    const { container } = render(
      <>
        <MediaFacade itemId="a" title="A" payload={video('a')} cloudName="demo" />
        <MediaFacade itemId="b" title="B" payload={video('b')} cloudName="demo" />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Play' });
    fireEvent.click(first!);
    expect(container.querySelectorAll('video')).toHaveLength(1);
    expect(container.querySelector('video')?.getAttribute('src')).toContain('.mp4');
    fireEvent.click(second!);
    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(1);
    expect(videos[0]?.getAttribute('aria-label')).toBe('B');
  });

  it('shows a PDF’s first page and page count, and opens the viewer with Open original', async () => {
    await loadMediaModule('viewer');
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    const { container } = render(
      <MediaFacade
        itemId="p"
        title="Term"
        payload={{ kind: 'pdf', publicId: 'gobbit/items/d/doc', pages: 3, width: 595, height: 842 }}
        cloudName="demo"
      />,
    );
    expect(screen.getByText('PDF · 3 pages')).toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('pg_1,');
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      'https://res.cloudinary.com/demo/image/upload/gobbit/items/d/doc.pdf',
    );
  });

  it('says unavailable without media storage', () => {
    render(<MediaFacade itemId="x" title="X" payload={video('x')} cloudName={null} />);
    expect(screen.getByText('File unavailable')).toBeInTheDocument();
  });
});
