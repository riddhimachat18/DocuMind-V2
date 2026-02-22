import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';

export interface BRDSection {
  id: string;
  title: string;
  sentences: Array<{
    id: string;
    text: string;
    hasConflict?: boolean;
  }>;
}

export interface DataSource {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  snippets: number;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  uploaded: string;
  snippets: number;
  status: 'processing' | 'processed' | 'error';
  breakdown?: Record<string, number>;
}

export interface BRDVersion {
  id: string;
  v: string;
  date: string;
  by: string;
  score: number;
  active: boolean;
}

export interface Conflict {
  id: string;
  req1: { text: string; source: string };
  req2: { text: string; source: string };
}

export const useBRDData = (projectId: string | undefined) => {
  const [brdSections, setBrdSections] = useState<BRDSection[]>([]);
  const [connectedSources, setConnectedSources] = useState<Record<string, boolean>>({});
  const [gmailCount, setGmailCount] = useState(0);
  const [meetingCount, setMeetingCount] = useState(0);
  const [slackCount, setSlackCount] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [versions, setVersions] = useState<BRDVersion[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build dataSources from connectedSources - ALWAYS returns 3 sources
  const dataSources: DataSource[] = [
    {
      id: 'gmail',
      name: 'Gmail / Email',
      icon: '✉',
      connected: connectedSources['gmail'] === true,
      snippets: gmailCount,
    },
    {
      id: 'meetings',
      name: 'Meeting Transcripts',
      icon: '◎',
      connected: connectedSources['meeting'] === true,
      snippets: meetingCount,
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: '#',
      connected: connectedSources['slack'] === true,
      snippets: slackCount,
    },
  ];

  // Real-time listener for project connectedSources
  useEffect(() => {
    if (!projectId) return;

    const unsubProject = onSnapshot(
      doc(db, 'projects', projectId),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setConnectedSources(data.connectedSources ?? {});
        }
      },
      (err) => {
        console.error('Error fetching project connectedSources:', err);
      }
    );

    return () => unsubProject();
  }, [projectId]);

  // Real-time listeners for snippet counts by source
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    let firstLoad = true;

    const unsubGmail = onSnapshot(
      query(
        collection(db, 'snippets'),
        where('projectId', '==', projectId),
        where('source', '==', 'gmail')
      ),
      (snap) => {
        const count = snap.docs.filter(d => d.data().classification !== 'NOISE').length;
        setGmailCount(count);
        if (firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      },
      (err) => {
        console.error('Error fetching gmail snippets:', err);
        if (firstLoad) {
          firstLoad = false;
          setLoading(false);
        }
      }
    );

    const unsubMeeting = onSnapshot(
      query(
        collection(db, 'snippets'),
        where('projectId', '==', projectId),
        where('source', '==', 'meeting')
      ),
      (snap) => {
        const count = snap.docs.filter(d => d.data().classification !== 'NOISE').length;
        setMeetingCount(count);
      },
      (err) => {
        console.error('Error fetching meeting snippets:', err);
      }
    );

    const unsubSlack = onSnapshot(
      query(
        collection(db, 'snippets'),
        where('projectId', '==', projectId),
        where('source', '==', 'slack')
      ),
      (snap) => {
        const count = snap.docs.filter(d => d.data().classification !== 'NOISE').length;
        setSlackCount(count);
      },
      (err) => {
        console.error('Error fetching slack snippets:', err);
      }
    );

    return () => {
      unsubGmail();
      unsubMeeting();
      unsubSlack();
    };
  }, [projectId]);

  // Real-time listener for uploaded files
  useEffect(() => {
    if (!projectId) return;

    const unsubFiles = onSnapshot(
      query(
        collection(db, 'uploadedFiles'),
        where('projectId', '==', projectId),
        orderBy('uploadedAt', 'desc')
      ),
      (snap) => {
        const files = snap.docs
          .map(d => {
            const data = d.data();
            const uploadedAt = data.uploadedAt?.toDate?.() ?? new Date();
            const diffMs = Date.now() - uploadedAt.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const timeAgo =
              diffMins < 1 ? 'just now' :
              diffMins < 60 ? `${diffMins}m ago` :
              diffMins < 1440 ? `${Math.floor(diffMins / 60)}h ago` :
              `${Math.floor(diffMins / 1440)}d ago`;

            return {
              id: d.id,
              name: data.filename ?? 'Unknown file',
              type: data.filename?.split('.').pop() ?? 'txt',
              uploaded: timeAgo,
              status: data.status ?? 'processing',
              snippets: data.snippetCount ?? 0,
              breakdown: data.snippetBreakdown ?? {},
            };
          })
          .filter(f => f.name && f.name !== 'Unknown file'); // Filter out ghost documents
        
        setUploadedFiles(files);
      },
      (err) => {
        console.error('Error fetching uploaded files:', err);
      }
    );

    return () => unsubFiles();
  }, [projectId]);

  // Fetch BRD sections, versions, and conflicts
  useEffect(() => {
    if (!projectId) return;

    const fetchData = async () => {
      try {
        // Fetch project document to get current BRD version ID
        const projectDoc = await getDoc(doc(db, 'projects', projectId));
        let currentBrdVersionId: string | null = null;
        
        if (projectDoc.exists()) {
          const data = projectDoc.data();
          currentBrdVersionId = data.currentBrdVersionId || null;
        }

        // Fetch BRD sections from the current BRD version
        if (currentBrdVersionId) {
          const brdVersionDoc = await getDoc(doc(db, 'brdVersions', currentBrdVersionId));
          if (brdVersionDoc.exists()) {
            const brdData = brdVersionDoc.data();
            const sections = brdData.sections || {};
            
            // Convert sections object to array format
            const sectionArray: BRDSection[] = [];
            const sectionTitles: Record<string, string> = {
              executiveSummary: 'Executive Summary',
              stakeholderRegister: 'Stakeholder Register',
              functionalReqs: 'Functional Requirements',
              nfrReqs: 'Non-Functional Requirements',
              assumptions: 'Assumptions & Constraints',
              successMetrics: 'Success Metrics',
            };

            Object.entries(sections).forEach(([key, content]) => {
              if (content && typeof content === 'string') {
                const sentences = content
                  .split('\n')
                  .filter(line => line.trim().length > 0)
                  .map((line, idx) => ({
                    id: `${key}-${idx}`,
                    text: line.trim(),
                    hasConflict: false,
                  }));

                if (sentences.length > 0) {
                  sectionArray.push({
                    id: key,
                    title: sectionTitles[key] || key,
                    sentences,
                  });
                }
              }
            });

            setBrdSections(sectionArray);
          }
        }

        // Fetch BRD versions
        const versionsSnapshot = await getDocs(
          query(
            collection(db, 'brdVersions'),
            where('projectId', '==', projectId),
            orderBy('versionNumber', 'desc')
          )
        );
        const versionsData: BRDVersion[] = versionsSnapshot.docs.map((doc) => {
          const data = doc.data();
          const createdAt = data.createdAt?.toDate?.();
          const dateStr = createdAt 
            ? createdAt.toLocaleDateString() + ' ' + createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'Unknown date';
          
          return {
            id: doc.id,
            v: data.version || `v${data.versionNumber?.toFixed(1) || '1.0'}`,
            date: dateStr,
            by: 'AI Generated',
            score: data.qualityScore?.total || 0,
            active: doc.id === currentBrdVersionId,
          };
        });
        setVersions(versionsData);

        // Fetch conflicts
        const conflictsSnapshot = await getDocs(
          query(
            collection(db, 'conflictFlags'),
            where('projectId', '==', projectId),
            where('status', '==', 'open')
          )
        );
        const conflictsData: Conflict[] = conflictsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            req1: { 
              text: data.requirementA || '', 
              source: data.sourceA || 'Unknown' 
            },
            req2: { 
              text: data.requirementB || '', 
              source: data.sourceB || 'Unknown' 
            },
          };
        });
        setConflicts(conflictsData);
      } catch (err: any) {
        console.error('Error fetching BRD data:', err);
        setError(err.message || 'Failed to load BRD data');
      }
    };

    fetchData();
  }, [projectId]);

  return {
    brdSections,
    dataSources, // Always returns 3 sources
    uploadedFiles,
    versions,
    conflicts,
    loading,
    error,
  };
};
