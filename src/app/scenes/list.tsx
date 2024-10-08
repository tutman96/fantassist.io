import React, {useRef, useState} from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';

import Skeleton from '@mui/material/Skeleton';
import Input from '@mui/material/Input';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

import {sceneDatabase, createNewScene, importScene} from '.';
import * as Types from '@/protos/scene';

import {SceneListItem} from './listItem';
import RenameDialog from '@/partials/renameDialog';

const {useAllValues, createItem} = sceneDatabase;

function LoadingScenes() {
  return (
    <>
      <Skeleton />
      <Skeleton />
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </>
  );
}

const AddButton: React.FunctionComponent<{
  campaignId: string,
  onAdd: (scene: Types.Scene) => void;
}> = ({campaignId, onAdd}) => {
  const anchorEl = useRef<HTMLElement>();
  const [menuOpen, setMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scene, setScene] = useState<Types.Scene | null>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const allScenes = useAllValues();

  async function addNewScene() {
    const s = createNewScene(campaignId);
    if (allScenes) {
      s.name = `Scene ${allScenes.size + 1}`;
    }
    setScene(s);
    setEditNameOpen(true);
    setMenuOpen(false);
  }

  async function importNewScene() {
    try {
      setImporting(true);
      const scene = await importScene(campaignId);
      onAdd(scene);
    } catch (e) {
      console.error('Error importing scene', e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <IconButton ref={anchorEl as any} onClick={() => setMenuOpen(true)}>
        <AddCircleOutlineIcon />
      </IconButton>
      <RenameDialog
        open={editNameOpen && scene !== null}
        isNew
        name={scene?.name ?? ''}
        onConfirm={name => {
          scene!.name = name;
          createItem(scene!.id, scene!).then(() => {
            onAdd(scene!);
            setEditNameOpen(false);
          });
        }}
        onCancel={() => setEditNameOpen(false)}
      />
      <Menu
        anchorEl={anchorEl.current}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      >
        <MenuItem onClick={addNewScene}>Blank Scene</MenuItem>
        <MenuItem onClick={importNewScene} disabled={importing}>
          {importing ? 'Importing...' : 'Import Scene'}
        </MenuItem>
      </Menu>
    </>
  );
};

type Props = {
  onSceneSelect: (scene: Types.Scene) => any;
  selectedSceneId: string | null;
  campaignId: string;
};
const SceneList: React.FunctionComponent<Props> = ({
  onSceneSelect,
  selectedSceneId,
  campaignId,
}) => {
  const allScenes = useAllValues(campaignId ? `${campaignId}/` : undefined);
  const [searchText, setSearchText] = useState('');

  if (allScenes === undefined) {
    return <LoadingScenes />;
  }

  let sceneList = Array.from(allScenes.values());
  if (searchText) {
    sceneList = sceneList.filter(scene =>
      scene.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }
  sceneList = sceneList.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <Box sx={{display: 'flex'}}>
        <Input
          placeholder="Find a scene..."
          onChange={e => setSearchText(e.target.value)}
          value={searchText}
          fullWidth
        />
        <AddButton campaignId={campaignId} onAdd={onSceneSelect} />
      </Box>
      <List sx={{marginX: -2}}>
        <Box sx={{overflow: 'auto'}}>
          {sceneList.map(scene => (
            <SceneListItem
              key={scene.id}
              scene={scene}
              selected={selectedSceneId === scene.id}
              onSelect={() => onSceneSelect(scene)}
            />
          ))}

          {!sceneList.length && (
            <ListItem sx={{justifyContent: 'center'}} disabled={true}>
              <Typography>No Scenes</Typography>
            </ListItem>
          )}
        </Box>
      </List>
    </>
  );
};
export default SceneList;
