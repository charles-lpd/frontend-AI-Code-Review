import { Card } from '@/ui/card';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { memo, useMemo } from 'react';
import { Copy, Download, ExternalLink, Play } from 'lucide-react';
import type { GenerationModuleKey, GenerationRunArtifact } from '../../types/generation';

interface GenerationArtifactGalleryProps {
  moduleKey: GenerationModuleKey;
  artifacts: GenerationRunArtifact[];
  previewUrlMap: Record<string, string>;
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
  onCopyLink?: (artifact: GenerationRunArtifact) => void;
  onDownload?: (artifact: GenerationRunArtifact) => void;
}

function GenerationArtifactGalleryBase({
  moduleKey,
  artifacts,
  previewUrlMap,
  selectedArtifactId,
  onSelectArtifact,
  onCopyLink,
  onDownload,
}: GenerationArtifactGalleryProps) {
  const orderedArtifacts = useMemo(() => [...artifacts], [artifacts]);
  const selectedArtifact =
    orderedArtifacts.find((artifact) => artifact.artifactKey === selectedArtifactId) ??
    orderedArtifacts[0] ??
    null;
  const selectedPreviewUrl = selectedArtifact
    ? previewUrlMap[selectedArtifact.artifactKey]
    : undefined;
  const hasArtifactActions = Boolean(onCopyLink || onDownload);

  return (
    <Card className="generation-page__card generation-page__artifacts">
      <div className="generation-page__card-head">
        <div>
          <h2 className="generation-page__card-title">
            {moduleKey === 'image' ? '图片产物' : '视频产物'}
          </h2>
          <p className="generation-page__card-subtitle">
            任务成功后会校验文件，校验通过后在这里展示产物。
          </p>
        </div>
        <Badge className="generation-page__badge">{orderedArtifacts.length} 项</Badge>
      </div>

      {selectedArtifact ? (
        <div className="generation-page__artifact-preview">
          {selectedPreviewUrl ? (
            selectedArtifact.mimeType.startsWith('video/') || moduleKey === 'video' ? (
              <video
                className="generation-page__video"
                src={selectedPreviewUrl}
                controls
                preload="metadata"
              />
            ) : (
              <Button variant="ghost"
                type="button"
                className="generation-page__image-preview-button"
                onClick={() => onSelectArtifact(selectedArtifact.artifactKey)}
              >
                <img
                  className="generation-page__image-preview"
                  src={selectedPreviewUrl}
                  alt={selectedArtifact.title || selectedArtifact.artifactKey}
                />
              </Button>
            )
          ) : (
            <div className="generation-page__empty-note">
              {moduleKey === 'image'
                ? '图片文件校验中，未通过校验不会展示。'
                : '视频文件校验中，未通过校验不会展示。'}
            </div>
          )}
          <div className="generation-page__artifact-meta-row">
            <div>
              <div className="generation-page__artifact-name">
                {selectedArtifact.title || selectedArtifact.artifactKey}
              </div>
              <div className="generation-page__artifact-submeta">
                {selectedArtifact.mimeType}
                {typeof selectedArtifact.fileSize === 'number' && (
                  <> · {(selectedArtifact.fileSize / 1024 / 1024).toFixed(1)} MB</>
                )}
                {typeof selectedArtifact.width === 'number' && selectedArtifact.height && (
                  <> · {selectedArtifact.width}x{selectedArtifact.height}</>
                )}
                {typeof selectedArtifact.durationSeconds === 'number' && (
                  <> · {selectedArtifact.durationSeconds.toFixed(1)}s</>
                )}
              </div>
            </div>
            {hasArtifactActions && (
              <div className="generation-page__artifact-actions">
                {onCopyLink && (
                  <Button variant="outline"
                    type="button"
                    className="generation-page__ghost-button generation-page__ghost-button--small"
                    onClick={() => onCopyLink(selectedArtifact)}
                  >
                    <Copy size={14} />
                    复制链接
                  </Button>
                )}
                {onDownload && (
                  <Button variant="outline"
                    type="button"
                    className="generation-page__ghost-button generation-page__ghost-button--small"
                    onClick={() => onDownload(selectedArtifact)}
                  >
                    <Download size={14} />
                    下载
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="generation-page__empty-note">
          {moduleKey === 'image' ? '图片会在生成完成后显示。' : '视频会在生成完成后显示。'}
        </div>
      )}

      <div className="generation-page__artifact-grid">
        {orderedArtifacts.map((artifact) => {
          const isVideo = artifact.mimeType.startsWith('video/') || moduleKey === 'video';
          const isActive = artifact.artifactKey === selectedArtifact?.artifactKey;
          const previewUrl = previewUrlMap[artifact.artifactKey];
          return (
            <Button variant="ghost"
              key={artifact.artifactKey}
              type="button"
              className={`generation-page__artifact-card${isActive ? ' generation-page__artifact-card--active' : ''}`}
              onClick={() => onSelectArtifact(artifact.artifactKey)}
            >
              <div className="generation-page__artifact-thumb">
                {previewUrl ? isVideo ? (
                  <video
                    className="generation-page__artifact-thumb-video"
                    src={previewUrl}
                    preload="metadata"
                    muted
                  />
                ) : (
                  <img src={previewUrl} alt={artifact.title || artifact.artifactKey} />
                ) : isVideo ? (
                  <div className="generation-page__artifact-video-thumb">
                    <Play size={18} />
                    <span>等待校验</span>
                  </div>
                ) : (
                  <div className="generation-page__artifact-image-thumb generation-page__artifact-image-thumb--empty">
                    <span>等待校验</span>
                  </div>
                )}
              </div>
              <div className="generation-page__artifact-card-body">
                <div className="generation-page__artifact-card-title">
                  {artifact.title || artifact.artifactKey}
                </div>
                <div className="generation-page__artifact-card-subtitle">
                  {artifact.mimeType}
                </div>
                <div className="generation-page__artifact-card-link">
                  <ExternalLink size={13} />
                  <span>查看详情</span>
                </div>
              </div>
            </Button>
          );
        })}
      </div>
    </Card>
  );
}

export const GenerationArtifactGallery = memo(GenerationArtifactGalleryBase);
