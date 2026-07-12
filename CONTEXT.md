# Ansible UI

Ansible UI permet de consulter puis d'exécuter un dépôt Ansible depuis une machine d'exécution distante.

## Language

**Rebond**:
Machine distante qui héberge le dépôt Ansible et depuis laquelle les Runs sont exécutés.
_Avoid_: Control node, remote SSH

**Dépôt Ansible**:
Dépôt Git contenant les Playbooks et Inventaires exposés par Ansible UI.
_Avoid_: Repo, clone

**Révision distante**:
Commit courant de la branche Git de référence sur le serveur Git.
_Avoid_: Remote, état distant

**Synchronisation**:
Alignement de la copie du Dépôt Ansible présente sur le Rebond avec sa Révision distante.
_Avoid_: Clone, pull, refresh
